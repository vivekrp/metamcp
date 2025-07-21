import { randomUUID } from "node:crypto";
import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

import { metaMcpServerPool } from "../../../lib/metamcp/metamcp-server-pool";
import { createMiddlewareEnabledHandlers } from "./handlers";
import { ToolExecutionRequest } from "./types";

// Refactored tool execution logic to use middleware
export const executeToolWithMiddleware = async (
  req: ToolExecutionRequest,
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