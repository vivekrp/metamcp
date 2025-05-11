import express from 'express';

/**
 * Extract API key from Bearer token in Authorization header
 */
export const extractApiKey = (req: express.Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove "Bearer " prefix
}; 