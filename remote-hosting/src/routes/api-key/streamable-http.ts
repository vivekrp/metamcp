import { randomUUID } from 'node:crypto';

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import mcpProxy from '../../mcpProxy.js';
import { createMetaMcpTransport } from '../../transports.js';
import { metaMcpConnections, sessionTransports } from '../../types.js';


// Handler for /api-key/:apiKey/mcp POST
export const handleApiKeyUrlMcpPost = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = req.params.apiKey;
    console.log(`Received POST message for API key in URL: ${apiKey}`);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`Session ID: ${sessionId || 'not provided'}`);

    if (!sessionId) {
      // New connection without session ID
      console.log('New streamable-http connection for MetaMCP with API key in URL', apiKey);
      
      // Create a new web app transport without initializing a backing transport yet
      const webAppTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: async (newSessionId) => {
          console.log(`Created streamable web app transport ${newSessionId} for API key ${apiKey}`);
          
          // Create a new transport for this session
          try {
            const backingServerTransport = await createMetaMcpTransport(apiKey);
            
            // Store connection - we don't need a separate backing transport
            metaMcpConnections.set(newSessionId, {
                webAppTransport,
                backingServerTransport,
            });

            // Set up stderr handling for this transport
            if (backingServerTransport instanceof StdioClientTransport && backingServerTransport.stderr) {
                backingServerTransport.stderr.on('data', (chunk) => {
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
              transportToServer: backingServerTransport
            });
            
            console.log(`Set up session-specific transport for session ${newSessionId}`);
          } catch (error) {
            console.error(`Error creating session transport for ${newSessionId}:`, error);
          }
        }
      });

      await webAppTransport.start();

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

      // For requests with sessionIds, the StreamableHTTP transport knows 
      // how to route them to the correct handler, we just have to make sure
      // the correct session transport exists
      
      // Check if we need to create a session-specific transport
      if (!sessionTransports.has(sessionId)) {
        try {
          console.log(`Creating new session transport for existing session ${sessionId}`);
          const sessionTransport = await createMetaMcpTransport(apiKey);
          
          // Store in our session transports map
          sessionTransports.set(sessionId, {
            apiKey,
            transport: sessionTransport
          });
          
          // Set up stderr handling for this transport
          if (sessionTransport instanceof StdioClientTransport && sessionTransport.stderr) {
            sessionTransport.stderr.on('data', (chunk) => {
              // Forward to web app transport
              connection.webAppTransport.send({
                jsonrpc: '2.0',
                method: 'notifications/stderr',
                params: {
                  content: chunk.toString(),
                  sessionId: sessionId
                },
              });
            });
          }
          
          // Create a dedicated proxy for this session transport
          mcpProxy({
            transportToClient: connection.webAppTransport,
            transportToServer: sessionTransport
          });
          
          console.log(`Set up session-specific transport for session ${sessionId}`);
        } catch (error) {
          console.error(`Error creating session transport for ${sessionId}:`, error);
          res.status(500).json({
            error: error instanceof Error ? error.message : String(error)
          });
          return;
        }
      }

      if (connection.webAppTransport instanceof StreamableHTTPServerTransport) {
        await connection.webAppTransport.handleRequest(req, res);
      } else {
        res.status(400).json({ error: 'Transport type not supported for this endpoint' });
      }
    }
  } catch (error) {
    console.error('Error in /api-key/:apiKey/mcp POST route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /api-key/:apiKey/mcp GET
export const handleApiKeyUrlMcpGet = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = req.params.apiKey;
    const sessionId = req.headers['mcp-session-id'] as string;
    console.log(`Received GET message for API key in URL: ${apiKey} and sessionId ${sessionId}`);

    const connection = metaMcpConnections.get(sessionId);
    if (!connection || !connection.webAppTransport) {
      res.status(404).end('Session not found');
      return;
    }

    const transport = connection.webAppTransport as StreamableHTTPServerTransport;
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error in /api-key/:apiKey/mcp GET route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 