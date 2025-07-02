import {
  BulkImportMcpServersRequestSchema,
  BulkImportMcpServersResponseSchema,
  CreateMcpServerRequestSchema,
  CreateMcpServerResponseSchema,
  DeleteMcpServerResponseSchema,
  GetMcpServerResponseSchema,
  ListMcpServersResponseSchema,
  ServerParameters,
  UpdateMcpServerRequestSchema,
  UpdateMcpServerResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import { mcpServersRepository } from "../db/repositories";
import { McpServersSerializer } from "../db/serializers";
import { mcpServerPool } from "../lib/metamcp/mcp-server-pool";
import { convertDbServerToParams } from "../lib/metamcp/utils";

export const mcpServersImplementations = {
  create: async (
    input: z.infer<typeof CreateMcpServerRequestSchema>,
  ): Promise<z.infer<typeof CreateMcpServerResponseSchema>> => {
    try {
      const createdServer = await mcpServersRepository.create(input);

      if (!createdServer) {
        return {
          success: false as const,
          message: "Failed to create MCP server",
        };
      }

      // Ensure idle session for the newly created server
      const serverParams = await convertDbServerToParams(createdServer);
      if (serverParams) {
        await mcpServerPool.ensureIdleSessions({
          [createdServer.uuid]: serverParams,
        });
        console.log(
          `Ensured idle session for newly created server: ${createdServer.name} (${createdServer.uuid})`,
        );
      }

      return {
        success: true as const,
        data: McpServersSerializer.serializeMcpServer(createdServer),
        message: "MCP server created successfully",
      };
    } catch (error) {
      console.error("Error creating MCP server:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  list: async (): Promise<z.infer<typeof ListMcpServersResponseSchema>> => {
    try {
      const servers = await mcpServersRepository.findAll();

      return {
        success: true as const,
        data: McpServersSerializer.serializeMcpServerList(servers),
        message: "MCP servers retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching MCP servers:", error);
      return {
        success: false as const,
        data: [],
        message: "Failed to fetch MCP servers",
      };
    }
  },

  bulkImport: async (
    input: z.infer<typeof BulkImportMcpServersRequestSchema>,
  ): Promise<z.infer<typeof BulkImportMcpServersResponseSchema>> => {
    try {
      const serversToInsert = [];
      const errors: string[] = [];
      let imported = 0;

      for (const [serverName, serverConfig] of Object.entries(
        input.mcpServers,
      )) {
        try {
          // Validate server name format
          if (!/^[a-zA-Z0-9_-]+$/.test(serverName)) {
            throw new Error(
              `Server name "${serverName}" is invalid. Server names must only contain letters, numbers, underscores, and hyphens.`,
            );
          }

          // Provide default type if not specified
          const serverWithDefaults = {
            name: serverName,
            type: serverConfig.type || ("STDIO" as const),
            description: serverConfig.description || null,
            command: serverConfig.command || null,
            args: serverConfig.args || [],
            env: serverConfig.env || {},
            url: serverConfig.url || null,
            bearerToken: undefined,
          };

          serversToInsert.push(serverWithDefaults);
        } catch (error) {
          errors.push(
            `Failed to process server "${serverName}": ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      if (serversToInsert.length > 0) {
        const createdServers =
          await mcpServersRepository.bulkCreate(serversToInsert);
        imported = serversToInsert.length;

        // Ensure idle sessions for all imported servers
        if (createdServers && createdServers.length > 0) {
          const serverParamsPromises = createdServers.map(async (server) => {
            const params = await convertDbServerToParams(server);
            return params ? { uuid: server.uuid, params } : null;
          });

          const serverParamsResults =
            await Promise.allSettled(serverParamsPromises);
          const validServerParams: Record<string, ServerParameters> = {};

          serverParamsResults.forEach((result) => {
            if (result.status === "fulfilled" && result.value) {
              validServerParams[result.value.uuid] = result.value.params;
            }
          });

          if (Object.keys(validServerParams).length > 0) {
            await mcpServerPool.ensureIdleSessions(validServerParams);
            console.log(
              `Ensured idle sessions for ${Object.keys(validServerParams).length} bulk imported servers`,
            );
          }
        }
      }

      return {
        success: true as const,
        imported,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully imported ${imported} MCP servers${errors.length > 0 ? ` with ${errors.length} errors` : ""}`,
      };
    } catch (error) {
      console.error("Error bulk importing MCP servers:", error);
      return {
        success: false as const,
        imported: 0,
        message:
          error instanceof Error
            ? error.message
            : "Internal server error during bulk import",
      };
    }
  },

  get: async (input: {
    uuid: string;
  }): Promise<z.infer<typeof GetMcpServerResponseSchema>> => {
    try {
      const server = await mcpServersRepository.findByUuid(input.uuid);

      if (!server) {
        return {
          success: false as const,
          message: "MCP server not found",
        };
      }

      return {
        success: true as const,
        data: McpServersSerializer.serializeMcpServer(server),
        message: "MCP server retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching MCP server:", error);
      return {
        success: false as const,
        message: "Failed to fetch MCP server",
      };
    }
  },

  delete: async (input: {
    uuid: string;
  }): Promise<z.infer<typeof DeleteMcpServerResponseSchema>> => {
    try {
      const deletedServer = await mcpServersRepository.deleteByUuid(input.uuid);

      if (!deletedServer) {
        return {
          success: false as const,
          message: "MCP server not found",
        };
      }

      return {
        success: true as const,
        message: "MCP server deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting MCP server:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  update: async (
    input: z.infer<typeof UpdateMcpServerRequestSchema>,
  ): Promise<z.infer<typeof UpdateMcpServerResponseSchema>> => {
    try {
      const updatedServer = await mcpServersRepository.update(input);

      if (!updatedServer) {
        return {
          success: false as const,
          message: "MCP server not found",
        };
      }

      // Ensure idle session for the updated server
      const serverParams = await convertDbServerToParams(updatedServer);
      if (serverParams) {
        await mcpServerPool.ensureIdleSessions({
          [updatedServer.uuid]: serverParams,
        });
        console.log(
          `Ensured idle session for updated server: ${updatedServer.name} (${updatedServer.uuid})`,
        );
      }

      return {
        success: true as const,
        data: McpServersSerializer.serializeMcpServer(updatedServer),
        message: "MCP server updated successfully",
      };
    } catch (error) {
      console.error("Error updating MCP server:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },
};
