import { DatabaseEndpoint } from "@repo/zod-types";
import express from "express";

import { ApiKeysRepository } from "../db/repositories/api-keys.repo";

// Extend Express Request interface for our custom properties
export interface ApiKeyAuthenticatedRequest extends express.Request {
  namespaceUuid: string;
  endpointName: string;
  endpoint: DatabaseEndpoint;
  apiKeyUserId?: string;
  apiKeyUuid?: string;
}

const apiKeysRepository = new ApiKeysRepository();

/**
 * API Key authentication middleware with access control
 * Validates API keys and enforces endpoint access permissions:
 * - Public API keys (user_id = null) can only access public endpoints (user_id = null)
 * - Private API keys can access public endpoints and their own private endpoints
 */
export const authenticateApiKey = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const authReq = req as ApiKeyAuthenticatedRequest;
  const endpoint = authReq.endpoint;

  // Skip authentication if not enabled for this endpoint
  if (!endpoint?.enable_api_key_auth) {
    return next();
  }

  try {
    let apiKey: string | undefined;

    // Always check headers first (Authorization: Bearer <key> or X-API-Key: <key>)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7);
    } else {
      apiKey = req.headers["x-api-key"] as string;
    }

    // If no API key in headers and query param auth is enabled, check query parameters
    if (!apiKey && endpoint.use_query_param_auth) {
      apiKey = (req.query.api_key as string) || (req.query.apikey as string);
    }

    if (!apiKey) {
      const authMethods = [
        "Authorization header (Bearer token)",
        "X-API-Key header",
      ];
      if (endpoint.use_query_param_auth) {
        authMethods.push("query parameter (api_key or apikey)");
      }

      return res.status(401).json({
        error: "Authentication required",
        message: `API key required in one of: ${authMethods.join(", ")}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate the API key
    const validation = await apiKeysRepository.validateApiKey(apiKey);
    if (!validation.valid) {
      return res.status(401).json({
        error: "Invalid API key",
        message: "The provided API key is invalid or inactive",
        timestamp: new Date().toISOString(),
      });
    }

    // Add user info to request for potential logging/auditing
    authReq.apiKeyUserId = validation.user_id || undefined;
    authReq.apiKeyUuid = validation.key_uuid;

    // Check access control: ensure API key can access this endpoint
    // Public API keys (user_id = null) can only access public endpoints (user_id = null)
    // Private API keys can access public endpoints and their own private endpoints
    const isPublicApiKey = validation.user_id === null;
    const isPrivateEndpoint = endpoint.user_id !== null;

    if (isPublicApiKey && isPrivateEndpoint) {
      return res.status(403).json({
        error: "Access denied",
        message:
          "Public API keys cannot access private endpoints. Use a private API key owned by the endpoint owner.",
        timestamp: new Date().toISOString(),
      });
    }

    if (
      !isPublicApiKey &&
      isPrivateEndpoint &&
      endpoint.user_id !== validation.user_id
    ) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only access endpoints you own or public endpoints.",
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error) {
    console.error("Error validating API key:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to validate API key",
      timestamp: new Date().toISOString(),
    });
  }
};
