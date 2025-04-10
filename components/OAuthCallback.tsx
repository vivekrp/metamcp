import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';

import { createMcpServer } from "@/app/actions/mcp-servers";

import { createAuthProvider } from "../lib/auth";
import { SESSION_KEYS } from "../lib/constants";

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
        const authProvider = createAuthProvider(serverUuid);
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
              name: pendingServer.name,
              description: pendingServer.description,
              url: pendingServer.url,
              type: pendingServer.type,
              args: [],
              env: {},
              status: pendingServer.status,
              command: undefined,
            };

            await createMcpServer(pendingServer.profileUuid, processedData);
            console.log("Created MCP server after OAuth flow");

            // Clear the pending server data
            sessionStorage.removeItem(SESSION_KEYS.PENDING_MCP_SERVER);
          } catch (error) {
            console.error("Failed to create MCP server after OAuth:", error);
          }
        }

        // Redirect back to the MCP servers page
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
