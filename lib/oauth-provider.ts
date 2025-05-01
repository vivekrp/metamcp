import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformation,
  OAuthClientInformationSchema,
  OAuthTokens,
  OAuthTokensSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import { getMcpServerByUuid } from '@/app/actions/mcp-servers';
import { getOAuthSession, saveOAuthSession } from '@/app/actions/oauth';

// OAuth client provider that works with a specific MCP server
class DbOAuthClientProvider implements OAuthClientProvider {
  private mcpServerUuid: string;
  private profileUuid?: string;
  private storagePrefix: string;

  constructor(mcpServerUuid: string, profileUuid?: string) {
    this.mcpServerUuid = mcpServerUuid;
    this.profileUuid = profileUuid;
    this.storagePrefix = `oauth_${this.mcpServerUuid}_`;
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

  // Check if the server exists in the database
  private async serverExists() {
    if (!this.profileUuid) return false;

    const server = await getMcpServerByUuid(
      this.profileUuid,
      this.mcpServerUuid
    );

    return !!server;
  }

  // During OAuth flow, we use sessionStorage for temporary data
  // After successful authentication, we'll save to the database
  async clientInformation() {
    try {
      // Check if server exists in the database
      const exists = await this.serverExists();

      if (exists) {
        // Get from database if server exists
        const session = await getOAuthSession(this.mcpServerUuid);
        if (session?.client_information) {
          return await OAuthClientInformationSchema.parseAsync(
            session.client_information
          );
        }
      } else {
        // Get from session storage during OAuth flow
        const storedInfo = sessionStorage.getItem(
          `${this.storagePrefix}client_information`
        );
        if (storedInfo) {
          return await OAuthClientInformationSchema.parseAsync(
            JSON.parse(storedInfo)
          );
        }
      }

      return undefined;
    } catch (error) {
      console.error('Error retrieving client information:', error);
      return undefined;
    }
  }

  async saveClientInformation(clientInformation: OAuthClientInformation) {
    // Save to session storage during OAuth flow
    sessionStorage.setItem(
      `${this.storagePrefix}client_information`,
      JSON.stringify(clientInformation)
    );

    // If server exists, also save to database
    if (await this.serverExists()) {
      await saveOAuthSession({
        mcpServerUuid: this.mcpServerUuid,
        clientInformation,
      });
    }
  }

  async tokens() {
    try {
      // Check if server exists in the database
      const exists = await this.serverExists();

      if (exists) {
        // Get from database if server exists
        const session = await getOAuthSession(this.mcpServerUuid);
        if (session?.tokens) {
          return await OAuthTokensSchema.parseAsync(session.tokens);
        }
      } else {
        // Get from session storage during OAuth flow
        const storedTokens = sessionStorage.getItem(
          `${this.storagePrefix}tokens`
        );
        if (storedTokens) {
          return await OAuthTokensSchema.parseAsync(JSON.parse(storedTokens));
        }
      }

      return undefined;
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens) {
    // Save to session storage during OAuth flow
    sessionStorage.setItem(
      `${this.storagePrefix}tokens`,
      JSON.stringify(tokens)
    );

    // If server exists, also save to database
    if (await this.serverExists()) {
      await saveOAuthSession({
        mcpServerUuid: this.mcpServerUuid,
        tokens,
      });
    }
  }

  redirectToAuthorization(authorizationUrl: URL) {
    window.location.href = authorizationUrl.href;
  }

  async saveCodeVerifier(codeVerifier: string) {
    // Save to session storage during OAuth flow
    sessionStorage.setItem(`${this.storagePrefix}code_verifier`, codeVerifier);

    // If server exists, also save to database
    if (await this.serverExists()) {
      await saveOAuthSession({
        mcpServerUuid: this.mcpServerUuid,
        codeVerifier,
      });
    }
  }

  async codeVerifier() {
    // Check if server exists in the database
    const exists = await this.serverExists();

    if (exists) {
      // Get from database if server exists
      const session = await getOAuthSession(this.mcpServerUuid);
      if (session?.code_verifier) {
        return session.code_verifier;
      }
    }

    // Get from session storage during OAuth flow
    const codeVerifier = sessionStorage.getItem(
      `${this.storagePrefix}code_verifier`
    );
    if (!codeVerifier) {
      throw new Error('No code verifier saved for session');
    }

    return codeVerifier;
  }
}

// Factory function to create an OAuth provider for a specific MCP server
export function createAuthProvider(
  mcpServerUuid: string,
  profileUuid?: string
): OAuthClientProvider {
  return new DbOAuthClientProvider(mcpServerUuid, profileUuid);
}
