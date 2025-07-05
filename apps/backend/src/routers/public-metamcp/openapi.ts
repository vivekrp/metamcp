import { randomUUID } from "node:crypto";

import {
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseEndpoint } from "@repo/zod-types";
import express from "express";

import { ApiKeysRepository } from "../../db/repositories/api-keys.repo";
import { endpointsRepository } from "../../db/repositories/endpoints.repo";
import { getMcpServers } from "../../lib/metamcp/fetch-metamcp";
import { mcpServerPool } from "../../lib/metamcp/mcp-server-pool";
import { metaMcpServerPool } from "../../lib/metamcp/metamcp-server-pool";
import { sanitizeName } from "../../lib/metamcp/utils";

// Extend Express Request interface for our custom properties
interface AuthenticatedRequest extends express.Request {
  namespaceUuid: string;
  endpointName: string;
  endpoint: DatabaseEndpoint;
  apiKeyUserId?: string;
  apiKeyUuid?: string;
}

const openApiRouter = express.Router();
const apiKeysRepository = new ApiKeysRepository();

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
        timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
    });
  }
};

// Authentication middleware for API key
const authenticateApiKey = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const authReq = req as AuthenticatedRequest;
  const endpoint = authReq.endpoint;

  // Check if endpoint requires authentication
  if (!endpoint.enable_api_key_auth && !endpoint.use_query_param_auth) {
    return next();
  }

  let apiKey: string | undefined;

  // Check for API key in header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7);
  } else if (req.headers["x-api-key"]) {
    apiKey = req.headers["x-api-key"] as string;
  }

  // Check for API key in query params if endpoint allows it
  if (!apiKey && endpoint.use_query_param_auth && req.query.api_key) {
    apiKey = req.query.api_key as string;
  }

  if (!apiKey) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "API key required",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const apiKeyValidation = await apiKeysRepository.validateApiKey(apiKey);
    if (!apiKeyValidation.valid) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or inactive API key",
        timestamp: new Date().toISOString(),
      });
    }

    // Add API key info to request
    authReq.apiKeyUserId = apiKeyValidation.user_id;
    authReq.apiKeyUuid = apiKeyValidation.key_uuid;

    next();
  } catch (error) {
    console.error("Error authenticating API key:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to authenticate API key",
      timestamp: new Date().toISOString(),
    });
  }
};

// Convert MCP tools to OpenAPI schema
const generateOpenApiSchema = async (tools: Tool[], endpointName: string) => {
  const paths: Record<string, unknown> = {};

  // Convert each MCP tool to an OpenAPI path (mounted directly to root, no /tools/ prefix)
  for (const tool of tools) {
    const toolPath = `/${tool.name}`;
    const operationId = tool.name.replace(/[^a-zA-Z0-9]/g, "_");

    // Create request body schema from tool input schema
    const requestBodySchema = tool.inputSchema || {
      type: "object",
      properties: {},
    };

    // Determine HTTP method based on tool characteristics
    const httpMethod =
      requestBodySchema.properties &&
      Object.keys(requestBodySchema.properties).length > 0
        ? "post"
        : "get";

    const pathDefinition: Record<string, unknown> = {
      summary: tool.description || tool.name,
      operationId: `${operationId}_${httpMethod}`,
      responses: {
        "200": {
          description: "Successful Response",
          content: {
            "application/json": {
              schema: {},
            },
          },
        },
        "422": {
          description: "Validation Error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/HTTPValidationError",
              },
            },
          },
        },
      },
    };

    // Add request body for POST requests
    if (httpMethod === "post") {
      pathDefinition.requestBody = {
        content: {
          "application/json": {
            schema: requestBodySchema,
          },
        },
        required: true,
      };
    }

    paths[toolPath] = {
      [httpMethod]: pathDefinition,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${endpointName} Server`,
      description: `API server for ${endpointName} tools and utilities.`,
      version: "1.0.0",
    },
    paths,
    components: {
      schemas: {
        HTTPValidationError: {
          properties: {
            detail: {
              items: {
                $ref: "#/components/schemas/ValidationError",
              },
              type: "array",
              title: "Detail",
            },
          },
          type: "object",
          title: "HTTPValidationError",
        },
        ValidationError: {
          properties: {
            loc: {
              items: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "integer",
                  },
                ],
              },
              type: "array",
              title: "Location",
            },
            msg: {
              type: "string",
              title: "Message",
            },
            type: {
              type: "string",
              title: "Error Type",
            },
          },
          type: "object",
          required: ["loc", "msg", "type"],
          title: "ValidationError",
        },
      },
    },
  };
};

// Generic API endpoint that serves the OpenAPI docs UI
openApiRouter.get(
  "/:endpoint_name/api",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { endpointName } = authReq;

    // Return a simple HTML page with Swagger UI
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${endpointName} API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            background: #fafafa;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/metamcp/${endpointName}/api/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout"
            });
        }
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  },
);

// OpenAPI JSON schema endpoint (must come before tool execution routes)
openApiRouter.get(
  "/:endpoint_name/api/openapi.json",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;

    try {
      console.log(
        `OpenAPI schema request for ${endpointName} -> namespace ${namespaceUuid}`,
      );

      // Create a temporary session to get tools
      const sessionId = randomUUID();

      try {
        // Initialize session connections
        const mcpServerInstance = await metaMcpServerPool.getServer(
          sessionId,
          namespaceUuid,
        );
        if (!mcpServerInstance) {
          throw new Error("Failed to get MetaMCP server instance from pool");
        }

        // Get server parameters and collect tools from each server
        const serverParams = await getMcpServers(namespaceUuid);
        const allTools: Tool[] = [];

        await Promise.allSettled(
          Object.entries(serverParams).map(async ([mcpServerUuid, params]) => {
            const session = await mcpServerPool.getSession(
              sessionId,
              mcpServerUuid,
              params,
            );
            if (!session) return;

            const capabilities = session.client.getServerCapabilities();
            if (!capabilities?.tools) return;

            // Use name assigned by user, fallback to name from server
            const serverName =
              params.name || session.client.getServerVersion()?.name || "";

            try {
              const result = await session.client.request(
                {
                  method: "tools/list",
                  params: {},
                },
                ListToolsResultSchema,
              );

              const toolsWithSource =
                result.tools?.map((tool) => {
                  const toolName = `${sanitizeName(serverName)}__${tool.name}`;
                  return {
                    ...tool,
                    name: toolName,
                    description: tool.description,
                  };
                }) || [];

              allTools.push(...toolsWithSource);
            } catch (error) {
              console.error(`Error fetching tools from: ${serverName}`, error);
            }
          }),
        );

        const openApiSchema = await generateOpenApiSchema(
          allTools,
          endpointName,
        );

        res.json(openApiSchema);
      } finally {
        // Cleanup the temporary session
        await metaMcpServerPool.cleanupSession(sessionId);
      }
    } catch (error) {
      console.error("Error generating OpenAPI schema:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to generate OpenAPI schema",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Tool execution endpoint (mounted directly to /{endpoint}/api/{tool_name})
openApiRouter.post(
  "/:endpoint_name/api/:tool_name",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;
    const toolName = req.params.tool_name;
    const toolArguments = req.body || {};

    try {
      console.log(
        `Tool execution request for ${toolName} in ${endpointName} -> namespace ${namespaceUuid}`,
      );

      // Create a temporary session for this tool call
      const sessionId = randomUUID();

      try {
        // Initialize session connections
        const mcpServerInstance = await metaMcpServerPool.getServer(
          sessionId,
          namespaceUuid,
        );
        if (!mcpServerInstance) {
          throw new Error("Failed to get MetaMCP server instance from pool");
        }

        // Extract the original tool name by removing the server prefix
        const firstDoubleUnderscoreIndex = toolName.indexOf("__");
        if (firstDoubleUnderscoreIndex === -1) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found - invalid name format`,
            timestamp: new Date().toISOString(),
          });
        }

        const serverPrefix = toolName.substring(0, firstDoubleUnderscoreIndex);
        const originalToolName = toolName.substring(
          firstDoubleUnderscoreIndex + 2,
        );

        // Get server parameters and find the right session for this tool
        const serverParams = await getMcpServers(namespaceUuid);
        let targetSession = null;

        for (const [mcpServerUuid, params] of Object.entries(serverParams)) {
          const session = await mcpServerPool.getSession(
            sessionId,
            mcpServerUuid,
            params,
          );
          if (!session) continue;

          const capabilities = session.client.getServerCapabilities();
          if (!capabilities?.tools) continue;

          // Use name assigned by user, fallback to name from server
          const serverName =
            params.name || session.client.getServerVersion()?.name || "";

          if (sanitizeName(serverName) === serverPrefix) {
            targetSession = session;
            break;
          }
        }

        if (!targetSession) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found`,
            timestamp: new Date().toISOString(),
          });
        }

        // Execute the tool through the individual MCP client
        const result = await targetSession.client.request(
          {
            method: "tools/call",
            params: {
              name: originalToolName,
              arguments: toolArguments,
            },
          },
          CompatibilityCallToolResultSchema,
        );

        // Return the result directly (simplified format)
        res.json(result);
      } finally {
        // Cleanup the temporary session
        await metaMcpServerPool.cleanupSession(sessionId);
      }
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);

      // Handle different types of errors
      if (error instanceof Error) {
        if (error.message.includes("Unknown tool")) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found`,
            timestamp: new Date().toISOString(),
          });
        }

        return res.status(500).json({
          error: "Tool execution failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to execute tool",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Support GET requests for tools that don't require parameters
openApiRouter.get(
  "/:endpoint_name/api/:tool_name",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { namespaceUuid, endpointName } = authReq;
    const toolName = req.params.tool_name;

    try {
      console.log(
        `Tool execution request (GET) for ${toolName} in ${endpointName} -> namespace ${namespaceUuid}`,
      );

      // Create a temporary session for this tool call
      const sessionId = randomUUID();

      try {
        // Initialize session connections
        const mcpServerInstance = await metaMcpServerPool.getServer(
          sessionId,
          namespaceUuid,
        );
        if (!mcpServerInstance) {
          throw new Error("Failed to get MetaMCP server instance from pool");
        }

        // Extract the original tool name by removing the server prefix
        const firstDoubleUnderscoreIndex = toolName.indexOf("__");
        if (firstDoubleUnderscoreIndex === -1) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found - invalid name format`,
            timestamp: new Date().toISOString(),
          });
        }

        const serverPrefix = toolName.substring(0, firstDoubleUnderscoreIndex);
        const originalToolName = toolName.substring(
          firstDoubleUnderscoreIndex + 2,
        );

        // Get server parameters and find the right session for this tool
        const serverParams = await getMcpServers(namespaceUuid);
        let targetSession = null;

        for (const [mcpServerUuid, params] of Object.entries(serverParams)) {
          const session = await mcpServerPool.getSession(
            sessionId,
            mcpServerUuid,
            params,
          );
          if (!session) continue;

          const capabilities = session.client.getServerCapabilities();
          if (!capabilities?.tools) continue;

          // Use name assigned by user, fallback to name from server
          const serverName =
            params.name || session.client.getServerVersion()?.name || "";

          if (sanitizeName(serverName) === serverPrefix) {
            targetSession = session;
            break;
          }
        }

        if (!targetSession) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found`,
            timestamp: new Date().toISOString(),
          });
        }

        // Execute the tool through the individual MCP client
        const result = await targetSession.client.request(
          {
            method: "tools/call",
            params: {
              name: originalToolName,
              arguments: {},
            },
          },
          CompatibilityCallToolResultSchema,
        );

        // Return the result directly (simplified format)
        res.json(result);
      } finally {
        // Cleanup the temporary session
        await metaMcpServerPool.cleanupSession(sessionId);
      }
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);

      // Handle different types of errors
      if (error instanceof Error) {
        if (error.message.includes("Unknown tool")) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found`,
            timestamp: new Date().toISOString(),
          });
        }

        return res.status(500).json({
          error: "Tool execution failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to execute tool",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default openApiRouter;
