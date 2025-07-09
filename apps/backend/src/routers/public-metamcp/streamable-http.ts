import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { endpointsRepository } from "../../db/repositories/endpoints.repo";
import { metaMcpServerPool } from "../../lib/metamcp/metamcp-server-pool";
import {
  ApiKeyAuthenticatedRequest,
  authenticateApiKey,
} from "../../middleware/api-key-auth.middleware";

const streamableHttpRouter = express.Router();

const transports: Record<string, StreamableHTTPServerTransport> = {}; // Web app transports by sessionId

// Cleanup function for a specific session
const cleanupSession = async (sessionId: string) => {
  console.log(`Cleaning up StreamableHTTP session ${sessionId}`);

  // Clean up transport
  const transport = transports[sessionId];
  if (transport) {
    delete transports[sessionId];
    await transport.close();
  }

  // Clean up MetaMCP server pool session
  await metaMcpServerPool.cleanupSession(sessionId);
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
    const authReq = req as ApiKeyAuthenticatedRequest;
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

streamableHttpRouter.get(
  "/:endpoint_name/mcp",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    // const authReq = req as ApiKeyAuthenticatedRequest;
    // const { namespaceUuid, endpointName } = authReq;
    const sessionId = req.headers["mcp-session-id"] as string;

    // console.log(
    //   `Received GET message for public endpoint ${endpointName} -> namespace ${namespaceUuid} sessionId ${sessionId}`,
    // );

    try {
      const transport = transports[sessionId];
      if (!transport) {
        res.status(404).end("Session not found");
        return;
      } else {
        await transport.handleRequest(req, res);
      }
    } catch (error) {
      console.error("Error in public endpoint /mcp route:", error);
      res.status(500).json(error);
    }
  },
);

streamableHttpRouter.post(
  "/:endpoint_name/mcp",
  express.json(),
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as ApiKeyAuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      try {
        console.log(
          `New public endpoint StreamableHttp connection request for ${endpointName} -> namespace ${namespaceUuid}`,
        );

        // Generate session ID upfront
        const newSessionId = randomUUID();

        // Get or create MetaMCP server instance from the pool
        const mcpServerInstance = await metaMcpServerPool.getServer(
          newSessionId,
          namespaceUuid,
        );
        if (!mcpServerInstance) {
          throw new Error("Failed to get MetaMCP server instance from pool");
        }

        console.log(
          `Using MetaMCP server instance for public endpoint session ${newSessionId} (endpoint: ${endpointName})`,
        );

        // Create transport with the predetermined session ID
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: async (sessionId) => {
            try {
              console.log(`Session initialized for sessionId: ${sessionId}`);
            } catch (error) {
              console.error(
                `Error initializing public endpoint session ${sessionId}:`,
                error,
              );
            }
          },
        });

        // Note: Cleanup is handled explicitly via DELETE requests
        // StreamableHTTP is designed to persist across multiple requests
        console.log("Created public endpoint StreamableHttp transport");

        // Store transport reference
        transports[newSessionId] = transport;

        console.log(
          `Public Endpoint Client <-> Proxy sessionId: ${newSessionId} for endpoint ${endpointName} -> namespace ${namespaceUuid}`,
        );
        console.log(`Stored transport for sessionId: ${newSessionId}`);
        console.log(`Current stored sessions:`, Object.keys(transports));

        // Connect the server to the transport before handling the request
        await mcpServerInstance.server.connect(transport);

        // Now handle the request - server is guaranteed to be ready
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error in public endpoint /mcp POST route:", error);
        res.status(500).json(error);
      }
    } else {
      // console.log(
      //   `Received POST message for public endpoint ${endpointName} -> namespace ${namespaceUuid} sessionId ${sessionId}`,
      // );
      console.log(`Available session IDs:`, Object.keys(transports));
      console.log(`Looking for sessionId: ${sessionId}`);
      try {
        const transport = transports[sessionId];
        if (!transport) {
          console.error(
            `Transport not found for sessionId ${sessionId}. Available sessions:`,
            Object.keys(transports),
          );
          res.status(404).end("Transport not found for sessionId " + sessionId);
        } else {
          await transport.handleRequest(req, res, req.body);
        }
      } catch (error) {
        console.error("Error in public endpoint /mcp route:", error);
        res.status(500).json(error);
      }
    }
  },
);

streamableHttpRouter.delete(
  "/:endpoint_name/mcp",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as ApiKeyAuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    console.log(
      `Received DELETE message for public endpoint ${endpointName} -> namespace ${namespaceUuid} sessionId ${sessionId}`,
    );

    if (sessionId) {
      try {
        await cleanupSession(sessionId);
        console.log(
          `Public endpoint session ${sessionId} cleaned up successfully`,
        );
        res.status(200).end();
      } catch (error) {
        console.error("Error in public endpoint /mcp DELETE route:", error);
        res.status(500).json(error);
      }
    } else {
      res.status(400).end("Missing sessionId");
    }
  },
);

export default streamableHttpRouter;
