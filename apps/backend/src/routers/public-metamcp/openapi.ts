import { randomUUID } from "node:crypto";

import {
  CallToolRequest,
  CallToolResult,
  CompatibilityCallToolResultSchema,
  ListToolsRequest,
  ListToolsResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

import { ConnectedClient } from "@/lib/metamcp";

import { endpointsRepository } from "../../db/repositories/endpoints.repo";
import { getMcpServers } from "../../lib/metamcp/fetch-metamcp";
import { mcpServerPool } from "../../lib/metamcp/mcp-server-pool";
import {
  createFilterCallToolMiddleware,
  createFilterListToolsMiddleware,
} from "../../lib/metamcp/metamcp-middleware/filter-tools.functional";
import {
  CallToolHandler,
  compose,
  ListToolsHandler,
  MetaMCPHandlerContext,
} from "../../lib/metamcp/metamcp-middleware/functional-middleware";
import { metaMcpServerPool } from "../../lib/metamcp/metamcp-server-pool";
import { sanitizeName } from "../../lib/metamcp/utils";
import {
  ApiKeyAuthenticatedRequest,
  authenticateApiKey,
} from "../../middleware/api-key-auth.middleware";

const openApiRouter = express.Router();

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
      operationId: `${operationId}`,
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

// Original List Tools Handler (adapted from metamcp-proxy.ts)
const createOriginalListToolsHandler = (
  sessionId: string,
  includeInactiveServers: boolean = false,
): ListToolsHandler => {
  return async (request, context) => {
    const serverParams = await getMcpServers(
      context.namespaceUuid,
      includeInactiveServers,
    );
    const allTools: Tool[] = [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([mcpServerUuid, params]) => {
        const session = await mcpServerPool.getSession(
          context.sessionId,
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
              params: { _meta: request.params?._meta },
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

    return { tools: allTools };
  };
};

// Original Call Tool Handler (adapted from metamcp-proxy.ts)
const createOriginalCallToolHandler = (): CallToolHandler => {
  const toolToClient: Record<string, ConnectedClient> = {};
  const toolToServerUuid: Record<string, string> = {};

  return async (request, context) => {
    const { name, arguments: args } = request.params;

    // Extract the original tool name by removing the server prefix
    const firstDoubleUnderscoreIndex = name.indexOf("__");
    if (firstDoubleUnderscoreIndex === -1) {
      throw new Error(`Invalid tool name format: ${name}`);
    }

    const serverPrefix = name.substring(0, firstDoubleUnderscoreIndex);
    const originalToolName = name.substring(firstDoubleUnderscoreIndex + 2);

    // Get server parameters and find the right session for this tool
    const serverParams = await getMcpServers(context.namespaceUuid);
    let targetSession = null;

    for (const [mcpServerUuid, params] of Object.entries(serverParams)) {
      const session = await mcpServerPool.getSession(
        context.sessionId,
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
        toolToClient[name] = session;
        toolToServerUuid[name] = mcpServerUuid;
        break;
      }
    }

    if (!targetSession) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // Use the correct schema for tool calls
      const result = await targetSession.client.request(
        {
          method: "tools/call",
          params: {
            name: originalToolName,
            arguments: args || {},
            _meta: {
              progressToken: request.params._meta?.progressToken,
            },
          },
        },
        CompatibilityCallToolResultSchema,
      );

      // Cast the result to CallToolResult type
      return result as CallToolResult;
    } catch (error) {
      console.error(
        `Error calling tool "${name}" through ${
          targetSession.client.getServerVersion()?.name || "unknown"
        }:`,
        error,
      );
      throw error;
    }
  };
};

// Helper function to create middleware-enabled handlers
const createMiddlewareEnabledHandlers = (
  sessionId: string,
  namespaceUuid: string,
) => {
  // Create the handler context
  const handlerContext: MetaMCPHandlerContext = {
    namespaceUuid,
    sessionId,
  };

  // Create original handlers
  const originalListToolsHandler = createOriginalListToolsHandler(sessionId);
  const originalCallToolHandler = createOriginalCallToolHandler();

  // Compose middleware with handlers
  const listToolsWithMiddleware = compose(
    createFilterListToolsMiddleware({ cacheEnabled: true }),
    // Add more middleware here as needed
    // createLoggingMiddleware(),
    // createRateLimitingMiddleware(),
  )(originalListToolsHandler);

  const callToolWithMiddleware = compose(
    createFilterCallToolMiddleware({
      cacheEnabled: true,
      customErrorMessage: (toolName, reason) =>
        `Access denied to tool "${toolName}": ${reason}`,
    }),
    // Add more middleware here as needed
    // createAuditingMiddleware(),
    // createAuthorizationMiddleware(),
  )(originalCallToolHandler);

  return {
    handlerContext,
    listToolsWithMiddleware,
    callToolWithMiddleware,
  };
};

// Generic API endpoint that serves the OpenAPI docs UI
openApiRouter.get(
  "/:endpoint_name/api",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as ApiKeyAuthenticatedRequest;
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
    const authReq = req as ApiKeyAuthenticatedRequest;
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

        // Create middleware-enabled handlers
        const { handlerContext, listToolsWithMiddleware } =
          createMiddlewareEnabledHandlers(sessionId, namespaceUuid);

        // Use middleware-enabled list tools handler
        const listToolsRequest: ListToolsRequest = {
          method: "tools/list",
          params: {},
        };

        const result = await listToolsWithMiddleware(
          listToolsRequest,
          handlerContext,
        );

        const openApiSchema = await generateOpenApiSchema(
          result.tools || [],
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

// Refactored tool execution logic to use middleware
const executeToolWithMiddleware = async (
  req: ApiKeyAuthenticatedRequest & { params: { tool_name: string } },
  res: express.Response,
  toolArguments: Record<string, unknown>,
) => {
  const { namespaceUuid, endpointName } = req;
  const toolName = req.params.tool_name;

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

      // Create middleware-enabled handlers
      const { handlerContext, callToolWithMiddleware } =
        createMiddlewareEnabledHandlers(sessionId, namespaceUuid);

      // Use middleware-enabled call tool handler
      const callToolRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      };

      const result = await callToolWithMiddleware(
        callToolRequest,
        handlerContext,
      );

      // Check if the result indicates an error (from middleware)
      if (result.isError) {
        return res.status(403).json({
          error: "Tool access denied",
          message: result.content?.[0]?.text || "Tool is inactive",
          timestamp: new Date().toISOString(),
        });
      }

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
};

// Tool execution endpoint for POST requests
openApiRouter.post(
  "/:endpoint_name/api/:tool_name",
  express.json(),
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    await executeToolWithMiddleware(
      req as ApiKeyAuthenticatedRequest & { params: { tool_name: string } },
      res,
      req.body || {},
    );
  },
);

// Tool execution endpoint for GET requests (for tools with no parameters)
openApiRouter.get(
  "/:endpoint_name/api/:tool_name",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    await executeToolWithMiddleware(
      req as ApiKeyAuthenticatedRequest & { params: { tool_name: string } },
      res,
      {},
    );
  },
);

export default openApiRouter;
