// OAuth-related session storage keys
export const SESSION_KEYS = {
  CODE_VERIFIER: 'mcp_code_verifier',
  SERVER_URL: 'mcp_server_url',
  TOKENS: 'mcp_tokens',
  CLIENT_INFORMATION: 'mcp_client_information',
  MCP_SERVER_UUID: 'mcp_server_uuid',
  PROFILE_UUID: 'profile_uuid',
} as const;

export type ConnectionStatus =
  | 'connecting'
  | 'disconnected'
  | 'connected'
  | 'error'
  | 'error-connecting-to-proxy';
