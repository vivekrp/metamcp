import express from 'express';

import { defaultEnvironment } from '../transports.js';
import { connections, metaMcpConnections } from '../types.js';

// Handler for /health endpoint
export const handleHealth = (req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    connections: Array.from(connections.keys()),
    metaMcpConnections: Array.from(metaMcpConnections.keys()),
  });
};

// Handler for /config endpoint
export const handleConfig = (req: express.Request, res: express.Response, env: string, args: string) => {
  try {
    res.json({
      defaultEnvironment,
      defaultCommand: env,
      defaultArgs: args,
    });
  } catch (error) {
    console.error('Error in /config route:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 