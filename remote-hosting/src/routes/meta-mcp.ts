import { randomUUID } from 'node:crypto';

import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import mcpProxy from '../mcpProxy.js';
import { createMetaMcpTransport } from '../transports.js';
import { metaMcpConnections, sessionTransports } from '../types.js';

// Helper function to extract API key from request
const extractApiKey = (req: express.Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
};

// Handler for /sse endpoint (deprecated)
export const handleMetaMcpSse = async (req: express.Request, res: express.Response) => {
  try {
    console.log('WARNING: The /sse endpoint is deprecated and should be replaced with /mcp');
    console.log(`Session ID: ${req.headers['mcp-session-id'] || 'not provided'}`);

    // Extract API key from Authorization header
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    console.log(`New SSE connection for API key: ${apiKey}`);

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

    const webAppTransport = new SSEServerTransport(`/message`, res);
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

    metaMcpConnections.set(apiKey, {
      webAppTransport,
      backingServerTransport,
    });

    mcpProxy({
      transportToClient: webAppTransport,
      transportToServer: backingServerTransport,
    });

    // Handle cleanup when connection closes
    res.on('close', () => {
      console.log(`Connection closed for API key ${apiKey}`);
      metaMcpConnections.delete(apiKey);
    });

    console.log(`Set up MCP proxy for API key ${apiKey}`);
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
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    console.log(`Received message for API key ${apiKey}`);

    const connection = metaMcpConnections.get(apiKey);
    if (!connection) {
      res.status(404).end('Session not found');
      return;
    }
    
    if (connection.webAppTransport instanceof SSEServerTransport) {
      await connection.webAppTransport.handlePostMessage(req, res);
    } else {
      res.status(400).json({ error: 'Transport type not supported for this endpoint' });
    }
  } catch (error) {
    console.error(`Error in /message route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /api/mcp POST
export const handleMetaMcpPost = async (req: express.Request, res: express.Response) => {
  try {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`Received POST message for API key ${apiKey} and sessionId ${sessionId}`);

    if (!sessionId) {
      // New connection without session ID
      console.log('New streamable-http connection for MetaMCP with API key', apiKey);
      
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
        `Connected MCP client to backing server transport for API key ${apiKey}`
      );

      const webAppTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: async (newSessionId) => {
          console.log(`Created streamable web app transport ${newSessionId} for API key ${apiKey}`);
          
          // Create a session-specific transport for this new session
          try {
            // Create a new transport for this session
            const sessionTransport = await createMetaMcpTransport(apiKey, newSessionId);
            
            // Store in our session transports map
            sessionTransports.set(newSessionId, {
              apiKey,
              transport: sessionTransport
            });
            
            console.log(`Set up session-specific transport for session ${newSessionId}`);
            
            // Set up stderr handling for this transport
            if (sessionTransport instanceof StdioClientTransport && sessionTransport.stderr) {
              sessionTransport.stderr.on('data', (chunk) => {
                // Forward to web app transport
                webAppTransport.send({
                  jsonrpc: '2.0',
                  method: 'notifications/stderr',
                  params: {
                    content: chunk.toString(),
                    sessionId: newSessionId
                  },
                });
              });
            }
            
            // Create a dedicated proxy for this session transport
            mcpProxy({
              transportToClient: webAppTransport,
              transportToServer: sessionTransport
            });
          } catch (error) {
            console.error(`Error creating session transport for ${newSessionId}:`, error);
          }
        },
      });

      await webAppTransport.start();

      // Handle stderr from the main backing transport 
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

      // Store connection
      metaMcpConnections.set(apiKey, {
        webAppTransport,
        backingServerTransport,
        sessionTransports: new Map() // For compatibility
      });

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
      const connection = metaMcpConnections.get(apiKey);
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
          const sessionTransport = await createMetaMcpTransport(apiKey, sessionId);
          
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
    console.error('Error in /api/mcp POST route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handler for /api/mcp GET
export const handleMetaMcpGet = async (req: express.Request, res: express.Response) => {
  try {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string;
    console.log(`Received GET message for API key ${apiKey} and sessionId ${sessionId}`);

    const connection = metaMcpConnections.get(apiKey);
    if (!connection || !connection.webAppTransport) {
      res.status(404).end('Session not found');
      return;
    }

    // For requests with sessionIds, the StreamableHTTP transport knows 
    // how to route them to the correct handler, we just have to make sure
    // the correct session transport exists
    
    // Check if we need to create a session-specific transport
    if (sessionId && !sessionTransports.has(sessionId)) {
      try {
        console.log(`Creating new session transport for session ${sessionId} on GET request`);
        const sessionTransport = await createMetaMcpTransport(apiKey, sessionId);
        
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
  } catch (error) {
    console.error('Error in /api/mcp GET route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 