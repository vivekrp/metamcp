import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformation,
  OAuthClientInformationSchema,
  OAuthTokens,
  OAuthTokensSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import { createMcpServer, getMcpServerByUuid } from '@/app/actions/mcp-servers';
import { getOAuthSession, saveOAuthSession } from '@/app/actions/oauth';
import { McpServerType } from '@/db/schema';

// OAuth client provider that works with a specific MCP server
class DbOAuthClientProvider implements OAuthClientProvider {
  private mcpServerUuid: string;
  private profileUuid?: string;

  constructor(mcpServerUuid: string, profileUuid?: string) {
    this.mcpServerUuid = mcpServerUuid;
    this.profileUuid = profileUuid;
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

  // Ensure MCP server exists before proceeding with OAuth
  private async ensureMcpServerExists() {
    if (!this.profileUuid) return;

    const server = await getMcpServerByUuid(
      this.profileUuid,
      this.mcpServerUuid
    );
    if (!server) {
      // Create a placeholder MCP server if it doesn't exist
      await createMcpServer(this.profileUuid, {
        name: 'OAuth MCP Server',
        description: 'Automatically created for OAuth authentication',
        args: [],
        env: {},
        type: McpServerType.SSE,
        url: 'https://placeholder-url.com', // Will be updated later
      });
    }
  }

  async clientInformation() {
    try {
      await this.ensureMcpServerExists();
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
    await this.ensureMcpServerExists();
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      clientInformation,
    });
  }

  async tokens() {
    try {
      await this.ensureMcpServerExists();
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
    await this.ensureMcpServerExists();
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      tokens,
    });
  }

  redirectToAuthorization(authorizationUrl: URL) {
    window.location.href = authorizationUrl.href;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await this.ensureMcpServerExists();
    await saveOAuthSession({
      mcpServerUuid: this.mcpServerUuid,
      codeVerifier,
    });
  }

  async codeVerifier() {
    await this.ensureMcpServerExists();
    const session = await getOAuthSession(this.mcpServerUuid);
    if (!session?.code_verifier) {
      throw new Error('No code verifier saved for session');
    }

    return session.code_verifier;
  }
}

// Factory function to create an OAuth provider for a specific MCP server
export function createAuthProvider(
  mcpServerUuid: string,
  profileUuid?: string
): OAuthClientProvider {
  return new DbOAuthClientProvider(mcpServerUuid, profileUuid);
}
