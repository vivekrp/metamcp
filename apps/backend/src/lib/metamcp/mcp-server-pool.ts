import { ServerParameters } from "@repo/zod-types";

import {
  ConnectedClient,
  connectMetaMcpClient,
  createMetaMcpClient,
} from "./client";

export interface McpServerPoolStatus {
  idle: number;
  active: number;
  activeSessionIds: string[];
  idleServerUuids: string[];
}

export class McpServerPool {
  // Idle sessions: serverUuid -> ConnectedClient (no sessionId assigned yet)
  private idleSessions: Record<string, ConnectedClient> = {};

  // Active sessions: sessionId -> Record<serverUuid, ConnectedClient>
  private activeSessions: Record<string, Record<string, ConnectedClient>> = {};

  // Mapping: sessionId -> Set<serverUuid> for cleanup tracking
  private sessionToServers: Record<string, Set<string>> = {};

  // Server parameters cache: serverUuid -> ServerParameters
  private serverParamsCache: Record<string, ServerParameters> = {};

  // Track ongoing idle session creation to prevent duplicates
  private creatingIdleSessions: Set<string> = new Set();

  // Default number of idle sessions per server UUID
  private readonly defaultIdleCount: number;

  constructor(defaultIdleCount: number = 1) {
    this.defaultIdleCount = defaultIdleCount;
  }

  /**
   * Get or create a session for a specific MCP server
   */
  async getSession(
    sessionId: string,
    serverUuid: string,
    params: ServerParameters,
  ): Promise<ConnectedClient | undefined> {
    // Update server params cache
    this.serverParamsCache[serverUuid] = params;

    // Check if we already have an active session for this sessionId and server
    if (this.activeSessions[sessionId]?.[serverUuid]) {
      return this.activeSessions[sessionId][serverUuid];
    }

    // Initialize session if it doesn't exist
    if (!this.activeSessions[sessionId]) {
      this.activeSessions[sessionId] = {};
      this.sessionToServers[sessionId] = new Set();
    }

    // Check if we have an idle session for this server that we can convert
    const idleClient = this.idleSessions[serverUuid];
    if (idleClient) {
      // Convert idle session to active session
      delete this.idleSessions[serverUuid];
      this.activeSessions[sessionId][serverUuid] = idleClient;
      this.sessionToServers[sessionId].add(serverUuid);

      console.log(
        `Converted idle session to active for server ${serverUuid}, session ${sessionId}`,
      );

      // Create a new idle session to replace the one we just used (ASYNC - NON-BLOCKING)
      this.createIdleSessionAsync(serverUuid, params);

      return idleClient;
    }

    // No idle session available, create a new connection
    const newClient = await this.createNewConnection(params);
    if (!newClient) {
      return undefined;
    }

    this.activeSessions[sessionId][serverUuid] = newClient;
    this.sessionToServers[sessionId].add(serverUuid);

    console.log(
      `Created new active session for server ${serverUuid}, session ${sessionId}`,
    );

    // Also create an idle session for future use (ASYNC - NON-BLOCKING)
    this.createIdleSessionAsync(serverUuid, params);

    return newClient;
  }

  /**
   * Create a new connection for a server
   */
  private async createNewConnection(
    params: ServerParameters,
  ): Promise<ConnectedClient | undefined> {
    const { client, transport } = createMetaMcpClient(params);
    if (!client || !transport) {
      return undefined;
    }

    const connectedClient = await connectMetaMcpClient(client, transport);
    if (!connectedClient) {
      return undefined;
    }

    return connectedClient;
  }

  /**
   * Create an idle session for a server (blocking version for initial setup)
   */
  private async createIdleSession(
    serverUuid: string,
    params: ServerParameters,
  ): Promise<void> {
    // Don't create if we already have an idle session for this server
    if (this.idleSessions[serverUuid]) {
      return;
    }

    const newClient = await this.createNewConnection(params);
    if (newClient) {
      this.idleSessions[serverUuid] = newClient;
      console.log(`Created idle session for server ${serverUuid}`);
    }
  }

  /**
   * Create an idle session for a server asynchronously (non-blocking)
   */
  private createIdleSessionAsync(
    serverUuid: string,
    params: ServerParameters,
  ): void {
    // Don't create if we already have an idle session or are already creating one
    if (
      this.idleSessions[serverUuid] ||
      this.creatingIdleSessions.has(serverUuid)
    ) {
      return;
    }

    // Mark that we're creating an idle session for this server
    this.creatingIdleSessions.add(serverUuid);

    // Create the session in the background (fire and forget)
    this.createNewConnection(params)
      .then((newClient) => {
        if (newClient && !this.idleSessions[serverUuid]) {
          this.idleSessions[serverUuid] = newClient;
          console.log(
            `Created background idle session for server [${params.name}] ${serverUuid}`,
          );
        } else if (newClient) {
          // We already have an idle session, cleanup the extra one
          newClient.cleanup().catch((error) => {
            console.error(
              `Error cleaning up extra idle session for ${serverUuid}:`,
              error,
            );
          });
        }
      })
      .catch((error) => {
        console.error(
          `Error creating background idle session for ${serverUuid}:`,
          error,
        );
      })
      .finally(() => {
        // Remove from creating set
        this.creatingIdleSessions.delete(serverUuid);
      });
  }

  /**
   * Ensure idle sessions exist for all servers
   */
  async ensureIdleSessions(
    serverParams: Record<string, ServerParameters>,
  ): Promise<void> {
    const promises = Object.entries(serverParams).map(
      async ([uuid, params]) => {
        if (!this.idleSessions[uuid]) {
          await this.createIdleSession(uuid, params);
        }
      },
    );

    await Promise.allSettled(promises);
  }

  /**
   * Cleanup a session by sessionId
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const activeSession = this.activeSessions[sessionId];
    if (!activeSession) {
      return;
    }

    // Cleanup all connections for this session
    await Promise.allSettled(
      Object.entries(activeSession).map(async ([_serverUuid, client]) => {
        await client.cleanup();
      }),
    );

    // Remove from active sessions
    delete this.activeSessions[sessionId];

    // Clean up session to servers mapping
    const serverUuids = this.sessionToServers[sessionId];
    if (serverUuids) {
      // For each server this session was using, create new idle sessions if needed (ASYNC - NON-BLOCKING)
      Array.from(serverUuids).forEach((serverUuid) => {
        const params = this.serverParamsCache[serverUuid];
        if (params) {
          this.createIdleSessionAsync(serverUuid, params);
        }
      });

      delete this.sessionToServers[sessionId];
    }

    console.log(`Cleaned up MCP server pool session ${sessionId}`);
  }

  /**
   * Cleanup all sessions
   */
  async cleanupAll(): Promise<void> {
    // Cleanup all active sessions
    const activeSessionIds = Object.keys(this.activeSessions);
    await Promise.allSettled(
      activeSessionIds.map((sessionId) => this.cleanupSession(sessionId)),
    );

    // Cleanup all idle sessions
    await Promise.allSettled(
      Object.entries(this.idleSessions).map(async ([_uuid, client]) => {
        await client.cleanup();
      }),
    );

    // Clear all state
    this.idleSessions = {};
    this.activeSessions = {};
    this.sessionToServers = {};
    this.serverParamsCache = {};
    this.creatingIdleSessions.clear();

    console.log("Cleaned up all MCP server pool sessions");
  }

  /**
   * Get pool status for monitoring
   */
  getPoolStatus(): McpServerPoolStatus {
    const idle = Object.keys(this.idleSessions).length;
    const active = Object.keys(this.activeSessions).reduce(
      (total, sessionId) =>
        total + Object.keys(this.activeSessions[sessionId]).length,
      0,
    );

    return {
      idle,
      active,
      activeSessionIds: Object.keys(this.activeSessions),
      idleServerUuids: Object.keys(this.idleSessions),
    };
  }

  /**
   * Get active session connections for a specific session (for debugging/monitoring)
   */
  getSessionConnections(
    sessionId: string,
  ): Record<string, ConnectedClient> | undefined {
    return this.activeSessions[sessionId];
  }

  /**
   * Get all active session IDs (for debugging/monitoring)
   */
  getActiveSessionIds(): string[] {
    return Object.keys(this.activeSessions);
  }
}

// Create a singleton instance
export const mcpServerPool = new McpServerPool();
