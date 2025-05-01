#!/usr/bin/env node

import { parseArgs } from 'node:util';

import {
  SSEClientTransport,
  SseError,
} from '@modelcontextprotocol/sdk/client/sse.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import cors from 'cors';
import express from 'express';
import { parse as shellParseArgs } from 'shell-quote';
import { findActualExecutable } from 'spawn-rx';

import mcpProxy from './mcpProxy.js';

const SSE_HEADERS_PASSTHROUGH = ['authorization'];

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

// Map to store connections by UUID
const connections = new Map<
  string,
  {
    webAppTransport: SSEServerTransport;
    backingServerTransport: Transport;
  }
>();

// Map to store connections by API key
const metaMcpConnections = new Map<
  string,
  {
    webAppTransport: SSEServerTransport;
    backingServerTransport: Transport;
  }
>();

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
  } else {
    console.error(`Invalid transport type: ${transportType}`);
    throw new Error('Invalid transport type specified');
  }
};

const createMetaMcpTransport = async (apiKey: string): Promise<Transport> => {
  console.log('Creating MetaMCP transport');

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

  const { cmd, args } = findActualExecutable(command, origArgs);

  console.log(`Stdio transport: command=${cmd}, args=${args}`);

  const transport = new StdioClientTransport({
    command: cmd,
    args,
    env,
    stderr: 'pipe',
  });

  await transport.start();

  console.log('Spawned MetaMCP transport');
  return transport;
};

// New UUID-based SSE endpoint
app.get('/server/:uuid/sse', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    console.log(`New SSE connection for UUID: ${uuid}`);

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
    res.status(500).json(error);
  }
});

// New UUID-based message endpoint
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
    res.status(500).json(error);
  }
});

// New ApiKey-based SSE endpoint
app.get('/sse', async (req, res) => {
  try {
    console.log('Request query:', req.query);

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

    let backingServerTransport: Transport;

    try {
      backingServerTransport = await createMetaMcpTransport(apiKey);
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
    console.error(`Error in /api/sse route:`, error);
    res.status(500).json(error);
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
    await connection.webAppTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /api/message route:`, error);
    res.status(500).json(error);
  }
});

// New ApiKey-based SSE endpoint that doesn't require headers
app.get('/api-key/:apiKey/sse', async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    console.log(`New SSE connection for API key in URL: ${apiKey}`);

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

    let backingServerTransport: Transport;

    try {
      backingServerTransport = await createMetaMcpTransport(apiKey);
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
    });

    console.log(`Set up MCP proxy for API key ${apiKey}`);
  } catch (error) {
    console.error(`Error in /api-key/:apiKey/sse route:`, error);
    res.status(500).json(error);
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
    await connection.webAppTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /api-key/:apiKey/message route:`, error);
    res.status(500).json(error);
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: Array.from(connections.keys()),
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
    res.status(500).json(error);
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
