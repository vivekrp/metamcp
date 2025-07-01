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
import { createServer } from "../../lib/metamcp/index";

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

// Cache for MetaMCP servers by endpoint name
const metamcpServers: Record<
  string,
  {
    server: Awaited<ReturnType<typeof createServer>>["server"];
    cleanup: () => Promise<void>;
  }
> = {};

// Create a MetaMCP server instance
const createMetaMcpServer = async (
  namespaceUuid: string,
  sessionId: string,
  endpointName: string,
) => {
  // Check if we already have a server for this endpoint
  if (metamcpServers[endpointName]) {
    console.log(
      `Reusing existing MetaMCP server for endpoint: ${endpointName}`,
    );
    return metamcpServers[endpointName];
  }

  const { server, cleanup } = await createServer(namespaceUuid, sessionId);
  const serverInstance = { server, cleanup };

  // Cache by endpoint name
  metamcpServers[endpointName] = serverInstance;
  console.log(
    `Created and cached new MetaMCP server for OpenAPI endpoint: ${endpointName}`,
  );

  return serverInstance;
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
    });
  }

  try {
    const apiKeyValidation = await apiKeysRepository.validateApiKey(apiKey);
    if (!apiKeyValidation.valid) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or inactive API key",
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
    });
  }
};

// Convert MCP tools to OpenAPI schema
const generateOpenApiSchema = async (tools: Tool[], endpointName: string) => {
  const paths: Record<string, any> = {};

  // Add health check endpoint
  paths["/health"] = {
    get: {
      summary: "Health check",
      description: "Check if the API is healthy",
      responses: {
        "200": {
          description: "API is healthy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "ok" },
                  service: { type: "string", example: endpointName },
                },
              },
            },
          },
        },
      },
    },
  };

  // Convert each MCP tool to an OpenAPI path
  for (const tool of tools) {
    const toolPath = `/tools/${tool.name}`;

    // Create request body schema from tool input schema
    const requestBodySchema = tool.inputSchema || {
      type: "object",
      properties: {},
    };

    paths[toolPath] = {
      post: {
        summary: tool.name,
        description: tool.description || `Execute ${tool.name} tool`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestBodySchema,
            },
          },
        },
        responses: {
          "200": {
            description: "Tool execution successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          text: { type: "string" },
                        },
                      },
                    },
                    isError: { type: "boolean" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Bad request",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      title: `${endpointName} API`,
      description: `OpenAPI interface for ${endpointName} MCP tools`,
      version: "1.0.0",
    },
    servers: [
      {
        url: `/metamcp/${endpointName}/api`,
        description: `${endpointName} API server`,
      },
    ],
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
  };
};

// OpenAPI JSON schema endpoint
openApiRouter.get(
  "/:endpoint_name/openapi.json",
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
      const mcpServerInstance = await createMetaMcpServer(
        namespaceUuid,
        sessionId,
        endpointName,
      );

      // Get list of tools from the MCP server
      const toolsResult = await mcpServerInstance.server.request(
        {
          method: "tools/list",
          params: {},
        },
        ListToolsResultSchema,
      );

      const tools = toolsResult.tools || [];
      const openApiSchema = await generateOpenApiSchema(tools, endpointName);

      res.json(openApiSchema);
    } catch (error) {
      console.error("Error generating OpenAPI schema:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to generate OpenAPI schema",
      });
    }
  },
);

// Health check endpoint
openApiRouter.get(
  "/:endpoint_name/api/health",
  lookupEndpoint,
  authenticateApiKey,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { endpointName } = authReq;

    res.json({
      status: "ok",
      service: endpointName,
      timestamp: new Date().toISOString(),
    });
  },
);

// Tool execution endpoint
openApiRouter.post(
  "/:endpoint_name/api/tools/:tool_name",
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
      const mcpServerInstance = await createMetaMcpServer(
        namespaceUuid,
        sessionId,
        endpointName,
      );

      // Execute the tool through the MCP server
      const result = await mcpServerInstance.server.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArguments,
          },
        },
        CompatibilityCallToolResultSchema,
      );

      res.json(result);
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);

      // Handle different types of errors
      if (error instanceof Error) {
        if (error.message.includes("Unknown tool")) {
          return res.status(404).json({
            error: "Tool not found",
            message: `Tool '${toolName}' not found`,
          });
        }

        return res.status(500).json({
          error: "Tool execution failed",
          message: error.message,
        });
      }

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to execute tool",
      });
    }
  },
);

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
    <script>
        SwaggerUIBundle({
            url: '/metamcp/${endpointName}/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.presets.standalone
            ],
            plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
        });
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  },
);

export default openApiRouter;
