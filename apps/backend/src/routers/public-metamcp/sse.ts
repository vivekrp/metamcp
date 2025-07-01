import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { DatabaseEndpoint } from "@repo/zod-types";
import express from "express";

import { ApiKeysRepository } from "../../db/repositories/api-keys.repo";
import { endpointsRepository } from "../../db/repositories/endpoints.repo";
import { createServer } from "../../lib/metamcp/index";
import { mcpServerPool } from "../../lib/metamcp/mcp-server-pool";

// Extend Express Request interface for our custom properties
interface AuthenticatedRequest extends express.Request {
  namespaceUuid: string;
  endpointName: string;
  endpoint: DatabaseEndpoint;
  apiKeyUserId?: string;
  apiKeyUuid?: string;
}

const sseRouter = express.Router();
const apiKeysRepository = new ApiKeysRepository();

const webAppTransports: Map<string, Transport> = new Map<string, Transport>(); // Web app transports by sessionId
const metamcpServers: Map<
  string,
  {
    server: Awaited<ReturnType<typeof createServer>>["server"];
    cleanup: () => Promise<void>;
  }
> = new Map(); // MetaMCP servers by sessionId

// Create a MetaMCP server instance
const createMetaMcpServer = async (
  namespaceUuid: string,
  sessionId: string,
) => {
  const { server, cleanup } = await createServer(namespaceUuid, sessionId);
  return { server, cleanup };
};

// Cleanup function for a specific session
const cleanupSession = async (sessionId: string) => {
  console.log(`Cleaning up SSE session ${sessionId}`);

  // Clean up transport
  const transport = webAppTransports.get(sessionId);
  if (transport) {
    webAppTransports.delete(sessionId);
    await transport.close();
  }

  // Clean up server instance
  const serverInstance = metamcpServers.get(sessionId);
  if (serverInstance) {
    metamcpServers.delete(sessionId);
    await serverInstance.cleanup();
  }

  // Clean up session connections
  await mcpServerPool.cleanupSession(sessionId);
};

// Middleware to lookup endpoint by name and add namespace info to request
const lookupEndpoint = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const endpointName = req.params.endpoint_name;

  try {
    const endpoint = await endpointsRepository.findByName(endpointName);
    if (!endpoint) {
      return res.status(404).json({
        error: "Endpoint not found",
        message: `No endpoint found with name: ${endpointName}`,
      });
    }

    // Add the endpoint info to the request for use in handlers
    const authReq = req as AuthenticatedRequest;
    authReq.namespaceUuid = endpoint.namespace_uuid;
    authReq.endpointName = endpointName;
    authReq.endpoint = endpoint;

    next();
  } catch (error) {
    console.error("Error looking up endpoint:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to lookup endpoint",
    });
  }
};

// API Key authentication middleware
const authenticateApiKey = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const authReq = req as AuthenticatedRequest;
  const endpoint = authReq.endpoint;

  // Skip authentication if not enabled for this endpoint
  if (!endpoint?.enable_api_key_auth) {
    return next();
  }

  try {
    let apiKey: string | undefined;

    // Always check headers first (Authorization: Bearer <key> or X-API-Key: <key>)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7);
    } else {
      apiKey = req.headers["x-api-key"] as string;
    }

    // If no API key in headers and query param auth is enabled, check query parameters
    if (!apiKey && endpoint.use_query_param_auth) {
      apiKey = (req.query.api_key as string) || (req.query.apikey as string);
    }

    if (!apiKey) {
      const authMethods = [
        "Authorization header (Bearer token)",
        "X-API-Key header",
      ];
      if (endpoint.use_query_param_auth) {
        authMethods.push("query parameter (api_key or apikey)");
      }

      return res.status(401).json({
        error: "Authentication required",
        message: `API key required in one of: ${authMethods.join(", ")}`,
      });
    }

    // Validate the API key
    const validation = await apiKeysRepository.validateApiKey(apiKey);
    if (!validation.valid) {
      return res.status(401).json({
        error: "Invalid API key",
        message: "The provided API key is invalid or inactive",
      });
    }

    // Add user info to request for potential logging/auditing
    authReq.apiKeyUserId = validation.user_id;
    authReq.apiKeyUuid = validation.key_uuid;

    next();
  } catch (error) {
    console.error("Error validating API key:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to validate API key",
    });
  }
};

sseRouter.get(
  "/:endpoint_name/sse",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;

    try {
      console.log(
        `New public endpoint SSE connection request for ${endpointName} -> namespace ${namespaceUuid}`,
      );

      const webAppTransport = new SSEServerTransport(
        `/metamcp/${endpointName}/message`,
        res,
      );
      console.log("Created public endpoint SSE transport");

      const sessionId = webAppTransport.sessionId;

      // Create MetaMCP server instance with sessionId
      const mcpServerInstance = await createMetaMcpServer(
        namespaceUuid,
        sessionId,
      );
      console.log(
        `Created MetaMCP server instance for public endpoint session ${sessionId}`,
      );

      webAppTransports.set(sessionId, webAppTransport);
      metamcpServers.set(sessionId, mcpServerInstance);

      // Handle cleanup when connection closes
      res.on("close", async () => {
        console.log(
          `Public endpoint SSE connection closed for session ${sessionId}`,
        );
        await cleanupSession(sessionId);
      });

      await mcpServerInstance.server.connect(webAppTransport);
    } catch (error) {
      console.error("Error in public endpoint /sse route:", error);
      res.status(500).json(error);
    }
  },
);

sseRouter.post(
  "/:endpoint_name/message",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;

    try {
      const sessionId = req.query.sessionId;
      console.log(
        `Received POST message for public endpoint ${endpointName} -> namespace ${namespaceUuid} sessionId ${sessionId}`,
      );

      const transport = webAppTransports.get(
        sessionId as string,
      ) as SSEServerTransport;
      if (!transport) {
        res.status(404).end("Session not found");
        return;
      }
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error("Error in public endpoint /message route:", error);
      res.status(500).json(error);
    }
  },
);

export default sseRouter;
