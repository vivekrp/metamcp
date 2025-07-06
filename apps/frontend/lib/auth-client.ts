import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

import { getAppUrl } from "./env";

export const authClient = createAuthClient({
  baseURL: getAppUrl(),
  plugins: [genericOAuthClient()],
}) as ReturnType<typeof createAuthClient>;
