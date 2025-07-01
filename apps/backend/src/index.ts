import express from "express";

import { auth } from "./auth";
import { namespacesRepository } from "./db/repositories";
import { metaMcpServerPool } from "./lib/metamcp";
import mcpProxyRouter from "./routers/mcp-proxy";
import publicEndpointsRouter from "./routers/public-metamcp";
import trpcRouter from "./routers/trpc";

const app = express();

// Global JSON middleware for non-proxy routes
app.use((req, res, next) => {
  if (req.path.startsWith("/mcp-proxy/") || req.path.startsWith("/metamcp/")) {
    // Skip JSON parsing for all MCP proxy routes and public endpoints to allow raw stream access
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Mount better-auth routes by calling auth API directly
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    try {
      // Create a web Request object from Express request
      const url = new URL(req.url, `http://${req.headers.host}`);
      const headers = new Headers();

      // Copy headers from Express request
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value[0] : value);
        }
      });

      // Create Request object
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body:
          req.method !== "GET" && req.method !== "HEAD"
            ? JSON.stringify(req.body)
            : undefined,
      });

      // Call better-auth directly
      const response = await auth.handler(request);

      // Convert Response back to Express response
      res.status(response.status);

      // Copy headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Send body
      const body = await response.text();
      res.send(body);
    } catch (error) {
      console.error("Auth route error:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  next();
});

// Mount public endpoints routes (must be before JSON middleware to handle raw streams)
app.use("/metamcp", publicEndpointsRouter);

// Mount MCP proxy routes
app.use("/mcp-proxy", mcpProxyRouter);

// Mount tRPC routes
app.use("/trpc", trpcRouter);

// Startup function to initialize idle servers for all namespaces
async function initializeIdleServers() {
  try {
    console.log("Initializing idle servers for all namespaces...");

    // Fetch all namespaces from the database
    const namespaces = await namespacesRepository.findAll();
    const namespaceUuids = namespaces.map((namespace) => namespace.uuid);

    if (namespaceUuids.length === 0) {
      console.log("No namespaces found in database");
      return;
    }

    console.log(
      `Found ${namespaceUuids.length} namespaces: ${namespaceUuids.join(", ")}`,
    );

    // Gather all server parameters from all namespaces for MCP server pool
    console.log(
      "Gathering server parameters for MCP server pool initialization...",
    );
    const allServerParams: Record<string, any> = {};

    for (const namespaceUuid of namespaceUuids) {
      try {
        const { getMcpServers } = await import("./lib/metamcp/fetch-metamcp");
        const serverParams = await getMcpServers(namespaceUuid, true); // Include inactive servers

        // Merge server parameters (servers can be reused across namespaces)
        Object.assign(allServerParams, serverParams);
      } catch (error) {
        console.error(
          `Error getting server parameters for namespace ${namespaceUuid}:`,
          error,
        );
      }
    }

    console.log(
      `Found ${Object.keys(allServerParams).length} unique MCP servers across all namespaces`,
    );

    // Initialize idle sessions for the underlying MCP server pool
    if (Object.keys(allServerParams).length > 0) {
      const { mcpServerPool } = await import("./lib/metamcp");
      await mcpServerPool.ensureIdleSessions(allServerParams);
      console.log("✅ Successfully initialized idle MCP server pool sessions");
    }

    // Ensure idle servers for all namespaces (MetaMCP server pool)
    await metaMcpServerPool.ensureIdleServers(namespaceUuids, true);

    console.log("✅ Successfully initialized idle servers for all namespaces");
  } catch (error) {
    console.error("❌ Error initializing idle servers:", error);
    // Don't exit the process, just log the error
    // The server should still start even if idle server initialization fails
  }
}

app.listen(12009, async () => {
  console.log(`Server is running on port 12009`);
  console.log(`Auth routes available at: http://localhost:12009/api/auth`);
  console.log(
    `Public MetaMCP endpoints available at: http://localhost:12009/metamcp`,
  );
  console.log(
    `MCP Proxy routes available at: http://localhost:12009/mcp-proxy`,
  );
  console.log(`tRPC routes available at: http://localhost:12009/trpc`);

  // Initialize idle servers after server starts
  await initializeIdleServers();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});
