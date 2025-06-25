import { z } from "zod";

// OAuth Client Information schema (matching MCP SDK)
export const OAuthClientInformationSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  client_id_issued_at: z.number().optional(),
  client_secret_expires_at: z.number().optional(),
});

// OAuth Tokens schema (matching MCP SDK)
export const OAuthTokensSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

// Base OAuth Session schema - client_information can be nullable since DB has default {}
export const OAuthSessionSchema = z.object({
  uuid: z.string().uuid(),
  mcp_server_uuid: z.string().uuid(),
  client_information: OAuthClientInformationSchema.nullable(),
  tokens: OAuthTokensSchema.nullable(),
  code_verifier: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Get OAuth Session Request
export const GetOAuthSessionRequestSchema = z.object({
  mcp_server_uuid: z.string().uuid(),
});

// Get OAuth Session Response
export const GetOAuthSessionResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: OAuthSessionSchema,
    message: z.string(),
  }),
  z.object({
    success: z.literal(false),
    message: z.string(),
  }),
]);

// Upsert OAuth Session Request - all fields optional for updates
export const UpsertOAuthSessionRequestSchema = z.object({
  mcp_server_uuid: z.string().uuid(),
  client_information: OAuthClientInformationSchema.optional(),
  tokens: OAuthTokensSchema.nullable().optional(),
  code_verifier: z.string().nullable().optional(),
});

// Upsert OAuth Session Response
export const UpsertOAuthSessionResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: OAuthSessionSchema,
    message: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

// Repository-specific schemas
export const OAuthSessionCreateInputSchema = z.object({
  mcp_server_uuid: z.string(),
  client_information: OAuthClientInformationSchema.optional(),
  tokens: OAuthTokensSchema.nullable().optional(),
  code_verifier: z.string().nullable().optional(),
});

export const OAuthSessionUpdateInputSchema = z.object({
  mcp_server_uuid: z.string(),
  client_information: OAuthClientInformationSchema.optional(),
  tokens: OAuthTokensSchema.nullable().optional(),
  code_verifier: z.string().nullable().optional(),
});

// Export repository types
export type OAuthSessionCreateInput = z.infer<
  typeof OAuthSessionCreateInputSchema
>;
export type OAuthSessionUpdateInput = z.infer<
  typeof OAuthSessionUpdateInputSchema
>;

// Database-specific schemas (raw database results with Date objects)
export const DatabaseOAuthSessionSchema = z.object({
  uuid: z.string(),
  mcp_server_uuid: z.string(),
  client_information: OAuthClientInformationSchema.nullable(),
  tokens: OAuthTokensSchema.nullable(),
  code_verifier: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DatabaseOAuthSession = z.infer<typeof DatabaseOAuthSessionSchema>;
