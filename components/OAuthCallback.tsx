import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';

import { createMcpServer } from "@/app/actions/mcp-servers";
import { saveOAuthSession } from "@/app/actions/oauth";

import { SESSION_KEYS } from "../lib/constants";
import { createAuthProvider } from "../lib/oauth-provider";

const OAuthCallback = () => {
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Skip if we've already processed this callback
      if (hasProcessedRef.current) {
        return;
      }
      hasProcessedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const serverUrl = sessionStorage.getItem(SESSION_KEYS.SERVER_URL);
      const pendingServerJSON = sessionStorage.getItem(SESSION_KEYS.PENDING_MCP_SERVER);
      const pendingServer = pendingServerJSON ? JSON.parse(pendingServerJSON) : null;

      if (!code || !serverUrl) {
        console.error("Missing code or server URL");
        window.location.href = "/";
        return;
      }

      try {
        const serverUuid = pendingServer?.uuid || uuidv4();
        const authProvider = createAuthProvider(serverUuid, pendingServer?.profileUuid);
        const result = await auth(authProvider, {
          serverUrl,
          authorizationCode: code,
        });
        if (result !== "AUTHORIZED") {
          throw new Error(
            `Expected to be authorized after providing auth code, got: ${result}`,
          );
        }

        // If we have a pending MCP server to create, create it now
        if (pendingServer && pendingServer.profileUuid) {
          try {
            // Process server data to match expected format
            const processedData = {
              uuid: serverUuid,
              name: pendingServer.name,
              description: pendingServer.description,
              url: pendingServer.url,
              type: pendingServer.type,
              args: [],
              env: {},
              status: pendingServer.status,
              command: undefined,
            };

            // Create the MCP server now that we have successful authorization
            const createdServer = await createMcpServer(pendingServer.profileUuid, processedData);
            console.log("Created MCP server after OAuth flow");

            // Transfer OAuth data from session storage to database
            const storagePrefix = `oauth_${serverUuid}_`;
            const clientInformation = sessionStorage.getItem(`${storagePrefix}client_information`);
            const tokens = sessionStorage.getItem(`${storagePrefix}tokens`);
            const codeVerifier = sessionStorage.getItem(`${storagePrefix}code_verifier`);

            // Save OAuth session in database
            await saveOAuthSession({
              mcpServerUuid: serverUuid,
              clientInformation: clientInformation ? JSON.parse(clientInformation) : undefined,
              tokens: tokens ? JSON.parse(tokens) : undefined,
              codeVerifier: codeVerifier || undefined,
            });

            // Clean up session storage
            sessionStorage.removeItem(`${storagePrefix}client_information`);
            sessionStorage.removeItem(`${storagePrefix}tokens`);
            sessionStorage.removeItem(`${storagePrefix}code_verifier`);
            sessionStorage.removeItem(SESSION_KEYS.PENDING_MCP_SERVER);
            sessionStorage.removeItem(SESSION_KEYS.SERVER_URL);

            // Redirect to the specific MCP server page using the UUID
            if (createdServer && createdServer.uuid) {
              window.location.href = `/mcp-servers/${createdServer.uuid}`;
              return;
            }
          } catch (error) {
            console.error("Failed to create MCP server after OAuth:", error);
          }
        }

        // Fallback: Redirect to the MCP servers page if something went wrong with the server creation
        window.location.href = "/mcp-servers";
      } catch (error) {
        console.error("OAuth callback error:", error);
        window.location.href = "/";
      }
    };

    void handleCallback();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-lg text-gray-500">Processing OAuth callback...</p>
    </div>
  );
};

export default OAuthCallback;
