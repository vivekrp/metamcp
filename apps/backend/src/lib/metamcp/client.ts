import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StdioClientTransport,
  StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ServerParameters } from "@repo/zod-types";

import { metamcpLogStore } from "./log-store";
import path from "path";
import fs from "fs";

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), time));
export interface ConnectedClient {
  client: Client;
  cleanup: () => Promise<void>;
}

/**
 * Transforms localhost URLs to use host.docker.internal when running inside Docker
 */
export const transformDockerUrl = (url: string): string => {
  if (process.env.TRANSFORM_LOCALHOST_TO_DOCKER_INTERNAL === "true") {
    const transformed = url.replace(
      /localhost|127\.0\.0\.1/g,
      "host.docker.internal",
    );
    return transformed;
  }
  return url;
};

/**
 * Auto-detects the working directory for filesystem MCP servers
 * by extracting the first directory argument from the server arguments
 */
export const autoDetectFilesystemCwd = (serverParams: ServerParameters): string | undefined => {
  // Only auto-detect for filesystem MCP servers
  if (!serverParams.command?.includes('filesystem') && 
      !serverParams.name?.toLowerCase().includes('filesystem')) {
    return undefined;
  }

  // If cwd is already specified, don't override it
  if (serverParams.cwd) {
    return serverParams.cwd;
  }

  // Look for directory arguments in the server arguments
  const args = serverParams.args || [];
  for (const arg of args) {
    // Skip flags (arguments starting with -)
    if (arg.startsWith('-')) {
      continue;
    }

    // Check if this argument is a valid directory path
    try {
      const resolvedPath = path.resolve(arg);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
    } catch (error) {
      // Continue to next argument if this one is invalid
      continue;
    }
  }

  return undefined;
};

export const createMetaMcpClient = (
  serverParams: ServerParameters,
): { client: Client | undefined; transport: Transport | undefined } => {
  let transport: Transport | undefined;

  // Create the appropriate transport based on server type
  // Default to "STDIO" if type is undefined
  if (!serverParams.type || serverParams.type === "STDIO") {
    // Auto-detect working directory for filesystem MCP servers
    const detectedCwd = autoDetectFilesystemCwd(serverParams);
    
    // Log auto-detected working directory for debugging
    if (detectedCwd && !serverParams.cwd) {
      metamcpLogStore.addLog(
        serverParams.name,
        "info",
        `Auto-detected working directory: ${detectedCwd}`,
      );
    }
    
    const stdioParams: StdioServerParameters = {
      command: serverParams.command || "",
      args: serverParams.args || undefined,
      env: serverParams.env || undefined,
      stderr: "pipe",
      cwd: serverParams.cwd || detectedCwd || undefined,
    };
    transport = new StdioClientTransport(stdioParams);

    // Handle stderr stream when set to "pipe"
    if ((transport as StdioClientTransport).stderr) {
      const stderrStream = (transport as StdioClientTransport).stderr;

      stderrStream?.on("data", (chunk: Buffer) => {
        metamcpLogStore.addLog(
          serverParams.name,
          "error",
          chunk.toString().trim(),
        );
      });

      stderrStream?.on("error", (error: Error) => {
        metamcpLogStore.addLog(
          serverParams.name,
          "error",
          "stderr error",
          error,
        );
      });
    }
  } else if (serverParams.type === "SSE" && serverParams.url) {
    // Transform the URL if TRANSFORM_LOCALHOST_TO_DOCKER_INTERNAL is set to "true"
    const transformedUrl = transformDockerUrl(serverParams.url);

    // Check for authentication - prioritize OAuth tokens, fallback to bearerToken
    const hasAuth =
      serverParams.oauth_tokens?.access_token || serverParams.bearerToken;

    if (!hasAuth) {
      transport = new SSEClientTransport(new URL(transformedUrl));
    } else {
      const headers: Record<string, string> = {};

      // Use OAuth access token if available, otherwise use bearerToken
      const authToken =
        serverParams.oauth_tokens?.access_token || serverParams.bearerToken;
      headers["Authorization"] = `Bearer ${authToken}`;

      transport = new SSEClientTransport(new URL(transformedUrl), {
        requestInit: {
          headers,
        },
        eventSourceInit: {
          fetch: (url, init) => fetch(url, { ...init, headers }),
        },
      });
    }
  } else if (serverParams.type === "STREAMABLE_HTTP" && serverParams.url) {
    // Transform the URL if TRANSFORM_LOCALHOST_TO_DOCKER_INTERNAL is set to "true"
    const transformedUrl = transformDockerUrl(serverParams.url);

    // Check for authentication - prioritize OAuth tokens, fallback to bearerToken
    const hasAuth =
      serverParams.oauth_tokens?.access_token || serverParams.bearerToken;

    if (!hasAuth) {
      transport = new StreamableHTTPClientTransport(new URL(transformedUrl));
    } else {
      const headers: Record<string, string> = {};

      // Use OAuth access token if available, otherwise use bearerToken
      const authToken =
        serverParams.oauth_tokens?.access_token || serverParams.bearerToken;
      headers["Authorization"] = `Bearer ${authToken}`;

      transport = new StreamableHTTPClientTransport(new URL(transformedUrl), {
        requestInit: {
          headers,
        },
      });
    }
  } else {
    metamcpLogStore.addLog(
      serverParams.name,
      "error",
      `Unsupported server type: ${serverParams.type}`,
    );
    return { client: undefined, transport: undefined };
  }

  const client = new Client(
    {
      name: "metamcp-client",
      version: "2.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    },
  );
  return { client, transport };
};

export const connectMetaMcpClient = async (
  serverParams: ServerParameters,
): Promise<ConnectedClient | undefined> => {
  const waitFor = 5000;
  const retries = 3;
  let count = 0;
  let retry = true;

  while (retry) {
    try {
      // Create fresh client and transport for each attempt
      const { client, transport } = createMetaMcpClient(serverParams);
      if (!client || !transport) {
        return undefined;
      }

      await client.connect(transport);

      return {
        client,
        cleanup: async () => {
          await transport.close();
          await client.close();
        },
      };
    } catch (error) {
      metamcpLogStore.addLog(
        "client",
        "error",
        `Error connecting to MetaMCP client (attempt ${count + 1}/${retries})`,
        error,
      );
      count++;
      retry = count < retries;
      if (retry) {
        await sleep(waitFor);
      }
    }
  }

  return undefined;
};
