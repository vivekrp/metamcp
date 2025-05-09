# MetaMCP Remote Hosting

This is a remote hosting express server for MetaMCP that provides proxy functionality for different transport types.

## File Structure

The codebase is organized as follows:

- `src/server.ts` - Main entry point that sets up the Express server and routes
- `src/transports.ts` - Transport-related functionality
- `src/types.ts` - Common type definitions
- `src/mcpProxy.js` - MCP proxy implementation
- `src/routes/` - Route handlers organized by feature
  - `mcp.ts` - Handlers for the new primary MCP API
  - `legacy.ts` - Handlers for legacy UUID-based endpoints
  - `meta-mcp.ts` - Handlers for MetaMCP endpoints
  - `api.ts` - Handlers for API key URL-based endpoints
  - `util.ts` - Handlers for utility endpoints like health and config

## Available Endpoints

### Primary API (recommended)
- `GET /mcp` - Main endpoint for MCP using StreamableHTTP
- `POST /mcp` - Main endpoint for MCP using StreamableHTTP

### MetaMCP API
- `GET /api/mcp` - MetaMCP endpoint using StreamableHTTP
- `POST /api/mcp` - MetaMCP endpoint using StreamableHTTP
- `GET /sse` - MetaMCP endpoint using SSE (deprecated)
- `POST /message` - Message endpoint for SSE

### Legacy API (deprecated)
- `GET /server/:uuid/sse` - Legacy UUID-based endpoint using SSE
- `POST /server/:uuid/message` - Legacy UUID-based message endpoint
- `GET /api-key/:apiKey/sse` - Legacy API key URL-based endpoint
- `POST /api-key/:apiKey/message` - Legacy API key URL-based message endpoint

### Utility Endpoints
- `GET /health` - Health check endpoint
- `GET /config` - Configuration information

## Development

To run the server in development mode:

```bash
npm run dev
```

## Production

To build and run the server in production:

```bash
npm run build
npm start
``` 