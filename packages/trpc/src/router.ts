import { createFrontendRouter } from "./routers/frontend";
import { router } from "./trpc";

export const createAppRouter = (implementations: {
  frontend: Parameters<typeof createFrontendRouter>[0];
}) => {
  const frontendRouters = createFrontendRouter(implementations.frontend);

  return router({
    frontend: router({
      mcpServers: frontendRouters.mcpServers,
      namespaces: frontendRouters.namespaces,
      endpoints: frontendRouters.endpoints,
      oauth: frontendRouters.oauth,
      tools: frontendRouters.tools,
      config: frontendRouters.config,
    }),
    apiKeys: frontendRouters.apiKeys,
  });
};

export type AppRouter = ReturnType<typeof createAppRouter>;

// Export types for the router
export type { BaseContext } from "./trpc";
export { createFrontendRouter } from "./routers/frontend";
