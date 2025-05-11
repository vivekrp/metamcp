import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

import mcpProxy from '../../mcpProxy.js';
import { createMetaMcpTransport } from '../../transports.js';
import { metaMcpConnections } from '../../types.js';
import { extractApiKey } from '../../utils.js';

// Handler for /sse endpoint
export const handleMetaMcpSse = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      console.error('No Authorization Bearer token provided');
      res.status(401).json({
        error: 'Authorization Bearer token is required'
      });
      return;
    }

    console.log(`New SSE connection for API key from Authorization header`);

    let backingServerTransport;

    try {
      backingServerTransport = await createMetaMcpTransport(apiKey);
    } catch (error) {
      if (error instanceof SseError && error.code === 401) {
        console.error(
          'Received 401 Unauthorized from MCP server:',
          error.message
        );
        res.status(401).json({
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }

      throw error;
    }

    console.log(
      `Connected MCP client to backing server transport for API key`
    );

    const webAppTransport = new SSEServerTransport(
      `/message`,
      res
    );
    console.log(`Created web app transport`);

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

    metaMcpConnections.set(webAppTransport.sessionId, {
      webAppTransport,
      backingServerTransport,
    });

    mcpProxy({
      transportToClient: webAppTransport,
      transportToServer: backingServerTransport,
    });

    // Handle cleanup when connection closes
    res.on('close', () => {
      console.log(`Connection closed for session ${webAppTransport.sessionId}`);
      metaMcpConnections.delete(webAppTransport.sessionId);
      webAppTransport.close();
      backingServerTransport.close();
    });

    console.log(`Set up MCP proxy for session ${webAppTransport.sessionId}`);
  } catch (error) {
    console.error(`Error in /sse route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /message endpoint
export const handleMetaMcpMessage = async (req: express.Request, res: express.Response) => {
  try {
    // Get API key from Authorization header - though we don't actually use it for this endpoint
    // since we rely on the sessionId
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      console.error('No Authorization Bearer token provided');
      res.status(401).json({
        error: 'Authorization Bearer token is required'
      });
      return;
    }
    
    console.log(`Received message with Authorization header`);
    const sessionId = req.query.sessionId as string;

    const connection = metaMcpConnections.get(sessionId);
    if (!connection) {
      res.status(404).end(`Session not found, sessionId: ${sessionId}`);
      return;
    }

    const transport = connection.webAppTransport as SSEServerTransport;
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /message route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 