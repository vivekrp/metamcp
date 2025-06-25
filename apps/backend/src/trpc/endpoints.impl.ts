import {
  CreateEndpointRequestSchema,
  CreateEndpointResponseSchema,
  DeleteEndpointResponseSchema,
  GetEndpointResponseSchema,
  ListEndpointsResponseSchema,
  UpdateEndpointRequestSchema,
  UpdateEndpointResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import {
  ApiKeysRepository,
  endpointsRepository,
  mcpServersRepository,
} from "../db/repositories";
import { EndpointsSerializer } from "../db/serializers";

const apiKeysRepository = new ApiKeysRepository();

export const endpointsImplementations = {
  create: async (
    input: z.infer<typeof CreateEndpointRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof CreateEndpointResponseSchema>> => {
    try {
      // Check if endpoint name already exists
      const existingEndpoint = await endpointsRepository.findByName(input.name);
      if (existingEndpoint) {
        return {
          success: false as const,
          message: "Endpoint name already exists",
        };
      }

      const result = await endpointsRepository.create({
        name: input.name,
        description: input.description,
        namespace_uuid: input.namespaceUuid,
        enable_api_key_auth: input.enableApiKeyAuth ?? true,
        use_query_param_auth: input.useQueryParamAuth ?? false,
      });

      // Create MCP server if requested
      if (input.createMcpServer) {
        try {
          const mcpServerName = `${input.name}-endpoint`;
          const mcpServerDescription = `Auto-generated MCP server for endpoint "${input.name}"`;

          const baseUrl = process.env.APP_URL;
          const endpointUrl = `${baseUrl}/metamcp/${input.name}/mcp`;

          // Get or create API key for bearer token
          let bearerToken = "";
          try {
            const userApiKeys = await apiKeysRepository.findByUserId(userId);
            const activeApiKey = userApiKeys.find((key) => key.is_active);

            if (activeApiKey) {
              bearerToken = activeApiKey.key;
            } else {
              // Create a new API key if none exists
              const newApiKey = await apiKeysRepository.create({
                name: "Auto-generated for MCP Server",
                user_id: userId,
                is_active: true,
              });
              bearerToken = newApiKey.key;
            }
          } catch (apiKeyError) {
            console.error("Error getting API key for MCP server:", apiKeyError);
            // Continue without bearer token if API key operation fails
          }

          await mcpServersRepository.create({
            name: mcpServerName,
            description: mcpServerDescription,
            type: "STREAMABLE_HTTP",
            url: endpointUrl,
            bearerToken: bearerToken,
            command: "",
            args: [],
            env: {},
          });
        } catch (mcpError) {
          console.error("Error creating MCP server:", mcpError);
          // Don't fail the endpoint creation if MCP server creation fails
          // Just log the error and continue
        }
      }

      return {
        success: true as const,
        data: EndpointsSerializer.serializeEndpoint(result),
        message: "Endpoint created successfully",
      };
    } catch (error) {
      console.error("Error creating endpoint:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  list: async (): Promise<z.infer<typeof ListEndpointsResponseSchema>> => {
    try {
      const endpoints = await endpointsRepository.findAllWithNamespaces();

      return {
        success: true as const,
        data: EndpointsSerializer.serializeEndpointWithNamespaceList(endpoints),
        message: "Endpoints retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching endpoints:", error);
      return {
        success: false as const,
        data: [],
        message: "Failed to fetch endpoints",
      };
    }
  },

  get: async (input: {
    uuid: string;
  }): Promise<z.infer<typeof GetEndpointResponseSchema>> => {
    try {
      const endpoint = await endpointsRepository.findByUuidWithNamespace(
        input.uuid,
      );

      if (!endpoint) {
        return {
          success: false as const,
          message: "Endpoint not found",
        };
      }

      return {
        success: true as const,
        data: EndpointsSerializer.serializeEndpointWithNamespace(endpoint),
        message: "Endpoint retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching endpoint:", error);
      return {
        success: false as const,
        message: "Failed to fetch endpoint",
      };
    }
  },

  delete: async (input: {
    uuid: string;
  }): Promise<z.infer<typeof DeleteEndpointResponseSchema>> => {
    try {
      const deletedEndpoint = await endpointsRepository.deleteByUuid(
        input.uuid,
      );

      if (!deletedEndpoint) {
        return {
          success: false as const,
          message: "Endpoint not found",
        };
      }

      return {
        success: true as const,
        message: "Endpoint deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting endpoint:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  update: async (
    input: z.infer<typeof UpdateEndpointRequestSchema>,
  ): Promise<z.infer<typeof UpdateEndpointResponseSchema>> => {
    try {
      // Check if another endpoint with the same name exists (excluding current one)
      const existingEndpoint = await endpointsRepository.findByName(input.name);
      if (existingEndpoint && existingEndpoint.uuid !== input.uuid) {
        return {
          success: false as const,
          message: "Endpoint name already exists",
        };
      }

      const result = await endpointsRepository.update({
        uuid: input.uuid,
        name: input.name,
        description: input.description,
        namespace_uuid: input.namespaceUuid,
        enable_api_key_auth: input.enableApiKeyAuth,
        use_query_param_auth: input.useQueryParamAuth,
      });

      return {
        success: true as const,
        data: EndpointsSerializer.serializeEndpoint(result),
        message: "Endpoint updated successfully",
      };
    } catch (error) {
      console.error("Error updating endpoint:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },
};
