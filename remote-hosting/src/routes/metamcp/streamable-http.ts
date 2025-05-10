import { randomUUID } from 'node:crypto';

import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import mcpProxy from '../../mcpProxy.js';
import { createMetaMcpTransport } from '../../transports.js';
import { metaMcpConnections } from '../../types.js';
import { extractApiKey } from '../../utils.js';

// Handler for /mcp POST
export const handleMetaMcpPost = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing or invalid Bearer token' });
      return;
    }
    console.log(`Received POST message with Bearer token`);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`Session ID: ${sessionId || 'not provided'}`);

    if (!sessionId) {
      // New connection without session ID
      console.log('New streamable-http connection for MetaMCP with Bearer token');
      
      // Create a new connection without closing existing ones
      let backingServerTransport;

      try {
        // Create initial backing server transport for main API key connection
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
        `Connected MCP client to backing server transport with Bearer token`
      );

      const webAppTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: async (newSessionId) => {
          console.log(`Created streamable web app transport ${newSessionId} with Bearer token`);
          
          // Create a new transport for this session
          try {
            const sessionTransport = await createMetaMcpTransport(apiKey);
            
            // Store in our session transports map
            metaMcpConnections.set(newSessionId, {
              webAppTransport,
              backingServerTransport: sessionTransport
            });
            
            // Set up stderr handling for this transport
            if (sessionTransport instanceof StdioClientTransport && sessionTransport.stderr) {
              sessionTransport.stderr.on('data', (chunk) => {
                // Forward to web app transport
                webAppTransport.send({
                  jsonrpc: '2.0',
                  method: 'notifications/stderr',
                  params: {
                    content: chunk.toString(),
                  },
                });
              });
            }
            
            // Create a dedicated proxy for this session transport
            mcpProxy({
              transportToClient: webAppTransport,
              transportToServer: sessionTransport
            });
            
            console.log(`Set up session-specific transport for session ${newSessionId}`);
          } catch (error) {
            console.error(`Error creating session transport for ${newSessionId}:`, error);
          }
        }
      });

      await webAppTransport.start();

      if (backingServerTransport instanceof StdioClientTransport && backingServerTransport.stderr) {
        backingServerTransport.stderr.on('data', (chunk) => {
          webAppTransport.send({
            jsonrpc: '2.0',
            method: 'notifications/stderr',
            params: {
              content: chunk.toString(),
            },
          });
        });
      }

      // Set up main proxy for initial messages
      mcpProxy({
        transportToClient: webAppTransport,
        transportToServer: backingServerTransport
      });

      // Handle the first request
      await (webAppTransport as StreamableHTTPServerTransport).handleRequest(
        req,
        res,
        req.body,
      );
    } else {
      // Existing connection with session ID
      const connection = metaMcpConnections.get(sessionId);
      if (!connection || !connection.webAppTransport) {
        res.status(404).end('Session not found');
        return;
      }

      const transport = connection.webAppTransport as StreamableHTTPServerTransport;
      await transport.handleRequest(req, res);
    }
  } catch (error) {
    console.error('Error in /mcp POST route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /mcp GET
export const handleMetaMcpGet = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing or invalid Bearer token' });
      return;
    }
    const sessionId = req.headers['mcp-session-id'] as string;
    console.log(`Received GET message with Bearer token and sessionId ${sessionId}`);

    const connection = metaMcpConnections.get(sessionId);
    if (!connection || !connection.webAppTransport) {
      res.status(404).end('Session not found');
      return;
    }

    const transport = connection.webAppTransport as StreamableHTTPServerTransport;
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error in /mcp GET route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 