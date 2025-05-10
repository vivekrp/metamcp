import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// Map to store connections by UUID (for legacy endpoints)
export interface Connection {
  webAppTransport: SSEServerTransport;
  backingServerTransport: Transport;
}

// Map to store connections by API key for MetaMCP
export interface MetaMcpConnection {
  webAppTransport: Transport;
  backingServerTransport?: Transport;
}

// Export empty maps to be filled by the application
export const connections = new Map<string, Connection>();
export const metaMcpConnections = new Map<string, MetaMcpConnection>();