import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

import mcpProxy from '../../mcpProxy.js';
import { createMetaMcpTransport } from '../../transports.js';
import { metaMcpConnections } from '../../types.js';

// Handler for /api-key/:apiKey/sse endpoint (deprecated)
export const handleApiKeyUrlSse = async (req: express.Request, res: express.Response) => {
  try {
    console.log('WARNING: The /api-key/:apiKey/sse endpoint is deprecated and should be replaced with /api-key/:apiKey/mcp');
    
    const apiKey = req.params.apiKey;
    console.log(`New SSE connection for API key in URL: ${apiKey}`);

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
      `Connected MCP client to backing server transport for API key ${apiKey}`
    );

    const webAppTransport = new SSEServerTransport(
      `/api-key/${apiKey}/message`,
      res
    );
    console.log(`Created web app transport for API key ${apiKey}`);

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

    console.log(`Set up MCP proxy for session ${webAppTransport.sessionId} and API key ${apiKey}`);
  } catch (error) {
    console.error(`Error in /api-key/:apiKey/sse route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /api-key/:apiKey/message endpoint
export const handleApiKeyUrlMessage = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = req.params.apiKey;
    console.log(`Received message for API key in URL: ${apiKey}`);
    const sessionId = req.query.sessionId as string;

    const connection = metaMcpConnections.get(sessionId);
    if (!connection) {
      res.status(404).end(`Session not found, sessionId: ${sessionId}`);
      return;
    }

    const transport = connection.webAppTransport as SSEServerTransport;
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /api-key/:apiKey/message route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};