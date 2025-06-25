import {
  ConnectedClient,
  connectMetaMcpClient,
  createMetaMcpClient,
} from "./client";
import { getMcpServers, ServerParameters } from "./fetch-metamcp";
import { getSessionKey } from "./utils";

// Two-level cache: sessionId -> (server config hash -> ConnectedClient)
const _sessionConnections: Record<string, Record<string, ConnectedClient>> = {};

export const getSession = async (
  sessionId: string,
  serverUuid: string,
  params: ServerParameters,
): Promise<ConnectedClient | undefined> => {
  // Initialize session connections if not exists
  if (!_sessionConnections[sessionId]) {
    _sessionConnections[sessionId] = {};
  }

  const sessionConnections = _sessionConnections[sessionId];
  const sessionKey = getSessionKey(serverUuid, params);

  // Return existing connection for this server config in this session
  if (sessionConnections[sessionKey]) {
    return sessionConnections[sessionKey];
  }

  // Close existing session for this UUID if it exists with a different hash
  const oldSessionKeys = Object.keys(sessionConnections).filter((k) =>
    k.startsWith(`${serverUuid}_`),
  );

  await Promise.allSettled(
    oldSessionKeys.map(async (oldSessionKey) => {
      await sessionConnections[oldSessionKey].cleanup();
      delete sessionConnections[oldSessionKey];
    }),
  );

  // Create new connection for this server config in this session
  const { client, transport } = createMetaMcpClient(params);
  if (!client || !transport) {
    return;
  }

  const newClient = await connectMetaMcpClient(client, transport);
  if (!newClient) {
    return;
  }

  sessionConnections[sessionKey] = newClient;
  return newClient;
};

export const initSessionConnections = async (
  sessionId: string,
  namespaceUuid: string,
): Promise<void> => {
  const serverParams = await getMcpServers(namespaceUuid);

  // Initialize connections for all servers in this namespace for this session
  await Promise.allSettled(
    Object.entries(serverParams).map(async ([uuid, params]) => {
      try {
        await getSession(sessionId, uuid, params);
      } catch (_error) {
        // Ignore errors during initialization
      }
    }),
  );
};

export const cleanupSessionConnections = async (
  sessionId: string,
): Promise<void> => {
  const sessionConnections = _sessionConnections[sessionId];
  if (!sessionConnections) {
    return;
  }

  // Cleanup all connections for this session
  await Promise.allSettled(
    Object.entries(sessionConnections).map(async ([_sessionKey, client]) => {
      await client.cleanup();
    }),
  );

  // Remove the session from cache
  delete _sessionConnections[sessionId];
};

export const cleanupAllSessions = async (): Promise<void> => {
  await Promise.allSettled(
    Object.keys(_sessionConnections).map(async (sessionId) => {
      await cleanupSessionConnections(sessionId);
    }),
  );
};

// Get all active session IDs (for debugging/monitoring)
export const getActiveSessionIds = (): string[] => {
  return Object.keys(_sessionConnections);
};

// Get server connections for a specific session (for debugging/monitoring)
export const getSessionConnections = (
  sessionId: string,
): Record<string, ConnectedClient> | undefined => {
  return _sessionConnections[sessionId];
};
