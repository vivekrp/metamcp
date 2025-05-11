import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

import mcpProxy from '../mcpProxy.js';
import { createTransport } from '../transports.js';
import { connections } from '../types.js';

// Handler for legacy /server/:uuid/sse endpoint
export const handleLegacySse = async (req: express.Request, res: express.Response) => {
  try {
    console.log('WARNING: The /server/:uuid/sse endpoint is deprecated and should be replaced with /mcp');
    
    const uuid = req.params.uuid;
    console.log(`New SSE connection for UUID: ${uuid}`);
    console.log(`Session ID: ${req.headers['sessionid'] || 'not provided'}`);

    // Clean up existing connection with the same UUID
    if (connections.has(uuid)) {
      const existingConnection = connections.get(uuid)!;
      try {
        await existingConnection.backingServerTransport.close();
        await existingConnection.webAppTransport.close();
      } catch (error) {
        console.error(
          `Error closing existing connection for UUID ${uuid}:`,
          error
        );
      }
      connections.delete(uuid);
    }

    let backingServerTransport;

    try {
      backingServerTransport = await createTransport(req);
    } catch (error) {
      if (error instanceof SseError && error.code === 401) {
        console.error(
          'Received 401 Unauthorized from MCP server:',
          error.message
        );
        res.status(401).json(error);
        return;
      }

      throw error;
    }

    console.log(
      `Connected MCP client to backing server transport for UUID ${uuid}`
    );

    const webAppTransport = new SSEServerTransport(
      `/server/${uuid}/message`,
      res
    );
    console.log(`Created web app transport for UUID ${uuid}`);

    await webAppTransport.start();

    if (backingServerTransport instanceof StdioClientTransport) {
      backingServerTransport.stderr!.on('data', (chunk) => {
        webAppTransport.send({
          jsonrpc: '2.0',
          method: 'notifications/stderr',
          params: {
            content: chunk.toString(),
          },
        });
      });
    }

    connections.set(uuid, {
      webAppTransport,
      backingServerTransport,
    });

    mcpProxy({
      transportToClient: webAppTransport,
      transportToServer: backingServerTransport,
    });

    // Handle cleanup when connection closes
    res.on('close', () => {
      console.log(`Connection closed for UUID ${uuid}`);
      connections.delete(uuid);
    });

    console.log(`Set up MCP proxy for UUID ${uuid}`);
  } catch (error) {
    console.error(`Error in /${req.params.uuid}/sse route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for legacy /server/:uuid/message endpoint
export const handleLegacyMessage = async (req: express.Request, res: express.Response) => {
  try {
    const uuid = req.params.uuid;
    console.log(`Received message for UUID ${uuid}`);

    const connection = connections.get(uuid);
    if (!connection) {
      res.status(404).end('Session not found');
      return;
    }
    await connection.webAppTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /${req.params.uuid}/message route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 