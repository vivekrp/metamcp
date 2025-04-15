'use server';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  mcpServersTable,
  McpServerType,
  oauthSessionsTable,
} from '@/db/schema';
import { toolsTable } from '@/db/schema';

// Helper function to transform localhost URLs for Docker
function transformUrlForDocker(url: string): string {
  if (
    (process.env.USE_DOCKER_HOST ?? 'true') === 'true' &&
    url.includes('localhost')
  ) {
    return url.replace('localhost', 'host.docker.internal');
  }
  return url;
}

export async function refreshSseTools(mcpServerUuid: string) {
  const mcpServer = await db.query.mcpServersTable.findFirst({
    where: eq(mcpServersTable.uuid, mcpServerUuid),
  });

  if (!mcpServer) {
    throw new Error('MCP server not found');
  }

  if (mcpServer.type !== McpServerType.SSE) {
    throw new Error('MCP server is not an SSE server');
  }

  if (!mcpServer.url) {
    throw new Error('MCP server URL is not set');
  }

  // Get OAuth session if available
  const oauthSession = await db.query.oauthSessionsTable.findFirst({
    where: eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid),
  });

  const transformedUrl = transformUrlForDocker(mcpServer.url);

  // Prepare headers if OAuth tokens are available
  const headers: Record<string, string> = {};
  if (oauthSession?.tokens?.access_token) {
    headers['Authorization'] = `Bearer ${oauthSession.tokens.access_token}`;
  }

  const transport = new SSEClientTransport(new URL(transformedUrl), {
    eventSourceInit: {
      fetch: (url, init) => fetch(url, { ...init, headers }),
    },
    requestInit: {
      headers,
    },
  });

  const client = new Client(
    {
      name: 'metamcp-refresh-tools-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  await client.connect(transport);

  const { tools } = await client.listTools();

  // Format tools for database insertion
  const toolsToInsert = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    toolSchema: tool.inputSchema,
    mcp_server_uuid: mcpServer.uuid,
  }));

  if (toolsToInsert.length > 0) {
    // Batch insert all tools with upsert
    const results = await db
      .insert(toolsTable)
      .values(toolsToInsert)
      .onConflictDoUpdate({
        target: [toolsTable.mcp_server_uuid, toolsTable.name],
        set: {
          description: sql`excluded.description`,
          toolSchema: sql`excluded.tool_schema`,
        },
      })
      .returning();

    return { success: true, count: results.length, tools: results };
  }

  return { success: true, count: 0, tools: [] };
}
