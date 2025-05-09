#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import {
  SSEClientTransport,
  SseError,
} from '@modelcontextprotocol/sdk/client/sse.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import cors from 'cors';
import express from 'express';
import { parse as shellParseArgs } from 'shell-quote';
import { findActualExecutable } from 'spawn-rx';

import mcpProxy from './mcpProxy.js';

const SSE_HEADERS_PASSTHROUGH = ['authorization'];
const STREAMABLE_HTTP_HEADERS_PASSTHROUGH = [
  'authorization',
  'mcp-session-id',
  'last-event-id',
];

const defaultEnvironment = {
  ...getDefaultEnvironment(),
  ...(process.env.MCP_ENV_VARS ? JSON.parse(process.env.MCP_ENV_VARS) : {}),
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    env: { type: 'string', default: '' },
    args: { type: 'string', default: '' },
  },
});

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Expose-Headers', 'mcp-session-id');
  next();
});

// Map to store connections by UUID (for legacy endpoints)
const connections = new Map<
  string,
  {
    webAppTransport: SSEServerTransport;
    backingServerTransport: Transport;
  }
>();

// Map to store connections by API key for MetaMCP
const metaMcpConnections = new Map<
  string,
  {
    webAppTransport: Transport;
    backingServerTransport: Transport;
    sessionTransports?: Map<string, Transport>; // Optional to maintain compatibility with existing code
  }
>();

// Map to store session-specific transports by sessionId
const sessionTransports = new Map<string, { apiKey: string, transport: Transport }>();

// Map to store transports by sessionId for StreamableHTTP
const webAppTransports = new Map<string, Transport>();

const createTransport = async (req: express.Request): Promise<Transport> => {
  const query = req.query;
  console.log('Query parameters:', query);

  const transportType = query.transportType as string;

  if (transportType === 'stdio') {
    const command = query.command as string;
    const origArgs = shellParseArgs(query.args as string) as string[];
    const queryEnv = query.env ? JSON.parse(query.env as string) : {};
    const env = { ...process.env, ...defaultEnvironment, ...queryEnv };

    const { cmd, args } = findActualExecutable(command, origArgs);

    console.log(`Stdio transport: command=${cmd}, args=${args}`);

    const transport = new StdioClientTransport({
      command: cmd,
      args,
      env,
      stderr: 'pipe',
    });

    await transport.start();

    console.log('Spawned stdio transport');
    return transport;
  } else if (transportType === 'sse') {
    console.log('WARNING: The SSE transport is deprecated and has been replaced by streamable-http');
    
    const url = query.url as string;
    const headers: HeadersInit = {
      Accept: 'text/event-stream',
    };

    for (const key of SSE_HEADERS_PASSTHROUGH) {
      if (req.headers[key] === undefined) {
        continue;
      }

      const value = req.headers[key];
      headers[key] = Array.isArray(value) ? value[value.length - 1] : value;
    }

    // Replace localhost with host.docker.internal if using Docker
    let sseUrl = url;
    if (process.env.USE_DOCKER_HOST === 'true' && url.includes('localhost')) {
      sseUrl = url.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
      console.log(`Modified SSE URL: ${url} -> ${sseUrl}`);
    }

    console.log(
      `SSE transport: url=${sseUrl}, headers=${Object.keys(headers)}`
    );

    const transport = new SSEClientTransport(new URL(sseUrl), {
      eventSourceInit: {
        fetch: (url, init) => fetch(url, { ...init, headers }),
      },
      requestInit: {
        headers,
      },
    });
    await transport.start();

    console.log('Connected to SSE transport');
    return transport;
  } else if (transportType === 'streamable-http') {
    const url = query.url as string;
    const headers: HeadersInit = {
      Accept: 'text/event-stream, application/json',
    };

    for (const key of STREAMABLE_HTTP_HEADERS_PASSTHROUGH) {
      if (req.headers[key] === undefined) {
        continue;
      }

      const value = req.headers[key];
      headers[key] = Array.isArray(value) ? value[value.length - 1] : value;
    }

    // Replace localhost with host.docker.internal if using Docker
    let httpUrl = url;
    if (process.env.USE_DOCKER_HOST === 'true' && url.includes('localhost')) {
      httpUrl = url.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
      console.log(`Modified HTTP URL: ${url} -> ${httpUrl}`);
    }

    console.log(
      `Streamable HTTP transport: url=${httpUrl}, headers=${Object.keys(headers)}`
    );

    const transport = new StreamableHTTPClientTransport(
      new URL(httpUrl),
      {
        requestInit: {
          headers,
        },
      },
    );
    await transport.start();
    console.log('Connected to Streamable HTTP transport');
    return transport;
  } else {
    console.error(`Invalid transport type: ${transportType}`);
    throw new Error('Invalid transport type specified');
  }
};

const createMetaMcpTransport = async (apiKey: string, sessionId?: string): Promise<Transport> => {
  console.log(`Creating MetaMCP transport${sessionId ? ` for session ${sessionId}` : ''}`);

  const command = 'npx';
  const origArgs = shellParseArgs(
    '-y @metamcp/mcp-server-metamcp@latest'
  ) as string[];
  const env = {
    ...process.env,
    ...defaultEnvironment,
    METAMCP_API_KEY: apiKey,
    METAMCP_API_BASE_URL:
      process.env.USE_DOCKER_HOST === 'true'
        ? 'http://host.docker.internal:12005'
        : 'http://localhost:12005',
    USE_DOCKER_HOST: process.env.USE_DOCKER_HOST,
  };

  if (sessionId) {
    env.METAMCP_SESSION_ID = sessionId;
  }

  const { cmd, args } = findActualExecutable(command, origArgs);

  console.log(`Stdio transport: command=${cmd}, args=${args}`);

  const transport = new StdioClientTransport({
    command: cmd,
    args,
    env,
    stderr: 'pipe',
  });

  await transport.start();

  console.log(`Spawned MetaMCP transport${sessionId ? ` for session ${sessionId}` : ''}`);
  return transport;
};

// New endpoints with StreamableHTTP support
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  console.log(`Received GET message for sessionId ${sessionId}`);
  try {
    const transport = webAppTransports.get(
      sessionId,
    ) as StreamableHTTPServerTransport;
    if (!transport) {
      res.status(404).end('Session not found');
      return;
    } else {
      await transport.handleRequest(req, res);
    }
  } catch (error) {
    console.error('Error in /mcp route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log(`Received POST message for sessionId ${sessionId}`);
  
  if (!sessionId) {
    try {
      console.log('New streamable-http connection');
      let backingServerTransport: Transport;
      
      try {
        backingServerTransport = await createTransport(req);
      } catch (error) {
        if (error instanceof SseError && error.code === 401) {
          console.error(
            'Received 401 Unauthorized from MCP server:',
            error.message,
          );
          res.status(401).json(error);
          return;
        }
        throw error;
      }

      console.log('Connected MCP client to backing server transport');

      const webAppTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (sessionId) => {
          webAppTransports.set(sessionId, webAppTransport);
          console.log('Created streamable web app transport ' + sessionId);
        },
      });

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

      mcpProxy({
        transportToClient: webAppTransport,
        transportToServer: backingServerTransport,
      });

      await (webAppTransport as StreamableHTTPServerTransport).handleRequest(
        req,
        res,
        req.body,
      );
    } catch (error) {
      console.error('Error in /mcp POST route:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } else {
    try {
      const transport = webAppTransports.get(
        sessionId,
      ) as StreamableHTTPServerTransport;
      if (!transport) {
        res.status(404).end('Transport not found for sessionId ' + sessionId);
      } else {
        await (transport as StreamableHTTPServerTransport).handleRequest(
          req,
          res,
        );
      }
    } catch (error) {
      console.error('Error in /mcp route:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

// Legacy UUID-based SSE endpoint (now with deprecation warning)
app.get('/server/:uuid/sse', async (req, res) => {
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

    let backingServerTransport: Transport;

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
});

// Legacy UUID-based message endpoint
app.post('/server/:uuid/message', async (req, res) => {
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
});

// MetaMCP SSE endpoint with new StreamableHTTP support
app.get('/sse', async (req, res) => {
  try {
    console.log('WARNING: The /sse endpoint is deprecated and should be replaced with /mcp');
    console.log(`Session ID: ${req.headers['mcp-session-id'] || 'not provided'}`);

    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log(`New SSE connection for API key: ${apiKey}`);

    // Clean up existing connection with the same API key
    if (metaMcpConnections.has(apiKey)) {
      const existingConnection = metaMcpConnections.get(apiKey)!;
      try {
        console.log('Cleaning up existing connection for API key', apiKey);
        await existingConnection.backingServerTransport.close();
        await existingConnection.webAppTransport.close();
      } catch (error) {
        console.error(
          `Error closing existing connection for API key ${apiKey}:`,
          error
        );
      }
      metaMcpConnections.delete(apiKey);
    }

    // Clean up any session transports for this API key
    const sessionIds = Array.from(sessionTransports.keys()).filter(
      id => sessionTransports.get(id)?.apiKey === apiKey
    );
    
    for (const id of sessionIds) {
      const sessionData = sessionTransports.get(id);
      if (sessionData) {
        console.log(`Closing session ${id} transport for API key ${apiKey}`);
        await sessionData.transport.close();
        sessionTransports.delete(id);
      }
    }

    let backingServerTransport: Transport;

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
});

// Modified MetaMCP endpoint with StreamableHTTP support
app.post('/api/mcp', async (req, res) => {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`Received POST message for API key ${apiKey} and sessionId ${sessionId}`);

    if (!sessionId) {
      // New connection
      console.log('New streamable-http connection for MetaMCP with API key', apiKey);
      
      // Clean up existing connection with the same API key
      if (metaMcpConnections.has(apiKey)) {
        const existingConnection = metaMcpConnections.get(apiKey)!;
        try {
          console.log('Cleaning up existing connection for API key', apiKey);
          await existingConnection.backingServerTransport.close();
          await existingConnection.webAppTransport.close();
          
          // Clean up any session transports for this API key
          const sessionIds = Array.from(sessionTransports.keys()).filter(
            id => sessionTransports.get(id)?.apiKey === apiKey
          );
          
          for (const id of sessionIds) {
            const sessionData = sessionTransports.get(id);
            if (sessionData) {
              console.log(`Closing session ${id} transport for API key ${apiKey}`);
              await sessionData.transport.close();
              sessionTransports.delete(id);
            }
          }
        } catch (error) {
          console.error(
            `Error closing existing connection for API key ${apiKey}:`,
            error
          );
        }
        metaMcpConnections.delete(apiKey);
      }

      let backingServerTransport: Transport;

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
});

app.get('/api/mcp', async (req, res) => {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
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
});

app.post('/message', async (req, res) => {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
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
});

// Legacy MetaMCP endpoint for URL-based API keys
app.get('/api-key/:apiKey/sse', async (req, res) => {
  try {
    console.log('WARNING: The /api-key/:apiKey/sse endpoint is deprecated and should be replaced with /mcp');
    
    const apiKey = req.params.apiKey;
    console.log(`New SSE connection for API key in URL: ${apiKey}`);
    console.log(`Session ID: ${req.headers['mcp-session-id'] || 'not provided'}`);

    // Clean up existing connection with the same API key
    if (metaMcpConnections.has(apiKey)) {
      const existingConnection = metaMcpConnections.get(apiKey)!;
      try {
        console.log('Cleaning up existing connection for API key', apiKey);
        await existingConnection.backingServerTransport.close();
        await existingConnection.webAppTransport.close();
      } catch (error) {
        console.error(
          `Error closing existing connection for API key ${apiKey}:`,
          error
        );
      }
      metaMcpConnections.delete(apiKey);
    }

    // Clean up any session transports for this API key
    const sessionIds = Array.from(sessionTransports.keys()).filter(
      id => sessionTransports.get(id)?.apiKey === apiKey
    );
    
    for (const id of sessionIds) {
      const sessionData = sessionTransports.get(id);
      if (sessionData) {
        console.log(`Closing session ${id} transport for API key ${apiKey}`);
        await sessionData.transport.close();
        sessionTransports.delete(id);
      }
    }

    let backingServerTransport: Transport;

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

      // Clean up any session transports for this API key
      const sessionIds = Array.from(sessionTransports.keys()).filter(
        id => sessionTransports.get(id)?.apiKey === apiKey
      );
      
      for (const id of sessionIds) {
        const sessionData = sessionTransports.get(id);
        if (sessionData) {
          console.log(`Closing session ${id} transport for API key ${apiKey}`);
          sessionData.transport.close().catch(err => {
            console.error(`Error closing session transport for ${id}:`, err);
          });
          sessionTransports.delete(id);
        }
      }
    });

    console.log(`Set up MCP proxy for API key ${apiKey}`);
  } catch (error) {
    console.error(`Error in /api-key/:apiKey/sse route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/api-key/:apiKey/message', async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    console.log(`Received message for API key in URL: ${apiKey}`);

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
    console.error(`Error in /api-key/:apiKey/message route:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: Array.from(connections.keys()),
    metaMcpConnections: Array.from(metaMcpConnections.keys()),
  });
});

app.get('/config', (req, res) => {
  try {
    res.json({
      defaultEnvironment,
      defaultCommand: values.env,
      defaultArgs: values.args,
    });
  } catch (error) {
    console.error('Error in /config route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

const PORT = process.env.PORT || 12007;

const server = app.listen(PORT);
server.on('listening', () => {
  console.log(`⚙️ Proxy server listening on port ${PORT}`);
});
server.on('error', (err) => {
  if (err.message.includes(`EADDRINUSE`)) {
    console.error(`❌  Proxy Server PORT IS IN USE at port ${PORT} ❌ `);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
