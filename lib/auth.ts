import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformation,
  OAuthClientInformationSchema,
  OAuthTokens,
  OAuthTokensSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthSessionsTable } from '@/db/schema';

// Server actions for OAuth session management
export async function saveOAuthSession({
  mcpServerUuid,
  clientInformation,
  tokens,
  codeVerifier,
}: {
  mcpServerUuid: string;
  clientInformation?: OAuthClientInformation;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}) {
  'use server';

  // Check if session exists
  const existingSession = await db.query.oauthSessionsTable.findFirst({
    where: eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid),
  });

  if (existingSession) {
    // Update existing session
    await db
      .update(oauthSessionsTable)
      .set({
        ...(clientInformation && { client_information: clientInformation }),
        ...(tokens && { tokens }),
        ...(codeVerifier && { code_verifier: codeVerifier }),
        updated_at: new Date(),
      })
      .where(eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid));
  } else if (clientInformation) {
    // Create new session (require client_information for creation)
    await db.insert(oauthSessionsTable).values({
      mcp_server_uuid: mcpServerUuid,
      client_information: clientInformation,
      ...(tokens && { tokens }),
      ...(codeVerifier && { code_verifier: codeVerifier }),
    });
  }
}

export async function getOAuthSession(mcpServerUuid: string) {
  'use server';

  return await db.query.oauthSessionsTable.findFirst({
    where: eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid),
  });
}

// OAuth client provider that works with a specific MCP server
class DbOAuthClientProvider implements OAuthClientProvider {
  private mcpServerUuid: string;

  constructor(mcpServerUuid: string) {
    this.mcpServerUuid = mcpServerUuid;
  }

  get redirectUrl() {
    return window.location.origin + '/oauth/callback';
  }

  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'MetaMCP',
      client_uri: 'https://github.com/metatool-ai/metatool-app',
    };
  }

  async clientInformation() {
    try {
      const session = await getOAuthSession(this.mcpServerUuid);
      if (!session?.client_information) {
        return undefined;
      }

      return await OAuthClientInformationSchema.parseAsync(
        session.client_information
      );
    } catch (error) {
      console.error('Error retrieving client information:', error);
      return undefined;
    }
  }

  async saveClientInformation(clientInformation: OAuthClientInformation) {
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      clientInformation,
    });
  }

  async tokens() {
    try {
      const session = await getOAuthSession(this.mcpServerUuid);
      if (!session?.tokens) {
        return undefined;
      }

      return await OAuthTokensSchema.parseAsync(session.tokens);
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens) {
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      tokens,
    });
  }

  redirectToAuthorization(authorizationUrl: URL) {
    window.location.href = authorizationUrl.href;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      codeVerifier,
    });
  }

  async codeVerifier() {
    const session = await getOAuthSession(this.mcpServerUuid);
    if (!session?.code_verifier) {
      throw new Error('No code verifier saved for session');
    }

    return session.code_verifier;
  }
}

// Factory function to create an OAuth provider for a specific MCP server
export function createAuthProvider(mcpServerUuid: string): OAuthClientProvider {
  return new DbOAuthClientProvider(mcpServerUuid);
}
