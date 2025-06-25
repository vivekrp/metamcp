import {
  DatabaseMcpServer,
  McpServerCreateInput,
  McpServerUpdateInput,
} from "@repo/zod-types";
import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { mcpServersTable } from "../schema";

export class McpServersRepository {
  async create(input: McpServerCreateInput): Promise<DatabaseMcpServer> {
    try {
      const [createdServer] = await db
        .insert(mcpServersTable)
        .values(input)
        .returning();

      return createdServer;
    } catch (error: any) {
      console.error("Database error in create:", error);

      // Handle DrizzleQueryError structure - the actual PostgreSQL error might be in error.cause
      const pgError = error.cause || error;

      // Handle unique constraint violation for server name
      if (
        (pgError?.code === "23505" || error?.code === "23505") &&
        (pgError?.constraint === "mcp_servers_name_unique_idx" ||
          error?.constraint_name === "mcp_servers_name_unique_idx" ||
          pgError?.constraint_name === "mcp_servers_name_unique_idx")
      ) {
        throw new Error(
          `Server name "${input.name}" already exists. Server names must be unique.`,
        );
      }

      // Handle regex constraint violation for server name
      if (
        (pgError?.code === "23514" || error?.code === "23514") &&
        (pgError?.constraint === "mcp_servers_name_regex_check" ||
          error?.constraint_name === "mcp_servers_name_regex_check" ||
          pgError?.constraint_name === "mcp_servers_name_regex_check")
      ) {
        throw new Error(
          `Server name "${input.name}" is invalid. Server names must only contain letters, numbers, underscores, and hyphens.`,
        );
      }

      // For any other database errors, throw a generic user-friendly message
      throw new Error(
        "Failed to create MCP server. Please check your input and try again.",
      );
    }
  }

  async findAll(): Promise<DatabaseMcpServer[]> {
    return await db
      .select()
      .from(mcpServersTable)
      .orderBy(desc(mcpServersTable.created_at));
  }

  async findByUuid(uuid: string): Promise<DatabaseMcpServer | undefined> {
    const [server] = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.uuid, uuid))
      .limit(1);

    return server;
  }

  async findByName(name: string): Promise<DatabaseMcpServer | undefined> {
    const [server] = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.name, name))
      .limit(1);

    return server;
  }

  async deleteByUuid(uuid: string): Promise<DatabaseMcpServer | undefined> {
    const [deletedServer] = await db
      .delete(mcpServersTable)
      .where(eq(mcpServersTable.uuid, uuid))
      .returning();

    return deletedServer;
  }

  async update(
    input: McpServerUpdateInput,
  ): Promise<DatabaseMcpServer | undefined> {
    const { uuid, ...updateData } = input;

    try {
      const [updatedServer] = await db
        .update(mcpServersTable)
        .set(updateData)
        .where(eq(mcpServersTable.uuid, uuid))
        .returning();

      return updatedServer;
    } catch (error: any) {
      console.error("Database error in update:", error);

      // Handle DrizzleQueryError structure - the actual PostgreSQL error might be in error.cause
      const pgError = error.cause || error;

      // Handle unique constraint violation for server name
      if (
        (pgError?.code === "23505" || error?.code === "23505") &&
        (pgError?.constraint === "mcp_servers_name_unique_idx" ||
          error?.constraint_name === "mcp_servers_name_unique_idx" ||
          pgError?.constraint_name === "mcp_servers_name_unique_idx")
      ) {
        throw new Error(
          `Server name "${input.name}" already exists. Server names must be unique.`,
        );
      }

      // Handle regex constraint violation for server name
      if (
        (pgError?.code === "23514" || error?.code === "23514") &&
        (pgError?.constraint === "mcp_servers_name_regex_check" ||
          error?.constraint_name === "mcp_servers_name_regex_check" ||
          pgError?.constraint_name === "mcp_servers_name_regex_check")
      ) {
        throw new Error(
          `Server name "${input.name}" is invalid. Server names must only contain letters, numbers, underscores, and hyphens.`,
        );
      }

      // For any other database errors, throw a generic user-friendly message
      throw new Error(
        "Failed to update MCP server. Please check your input and try again.",
      );
    }
  }

  async bulkCreate(
    servers: McpServerCreateInput[],
  ): Promise<DatabaseMcpServer[]> {
    try {
      return await db.insert(mcpServersTable).values(servers).returning();
    } catch (error: any) {
      console.error("Database error in bulkCreate:", error);

      // Handle DrizzleQueryError structure - the actual PostgreSQL error might be in error.cause
      const pgError = error.cause || error;

      // Handle unique constraint violation for server name
      if (
        (pgError?.code === "23505" || error?.code === "23505") &&
        (pgError?.constraint === "mcp_servers_name_unique_idx" ||
          error?.constraint_name === "mcp_servers_name_unique_idx" ||
          pgError?.constraint_name === "mcp_servers_name_unique_idx")
      ) {
        throw new Error(
          "One or more server names already exist. Server names must be unique.",
        );
      }

      // Handle regex constraint violation for server name
      if (
        (pgError?.code === "23514" || error?.code === "23514") &&
        (pgError?.constraint === "mcp_servers_name_regex_check" ||
          error?.constraint_name === "mcp_servers_name_regex_check" ||
          pgError?.constraint_name === "mcp_servers_name_regex_check")
      ) {
        throw new Error(
          "One or more server names are invalid. Server names must only contain letters, numbers, underscores, and hyphens.",
        );
      }

      // For any other database errors, throw a generic user-friendly message
      throw new Error(
        "Failed to bulk create MCP servers. Please check your input and try again.",
      );
    }
  }
}

export const mcpServersRepository = new McpServersRepository();
