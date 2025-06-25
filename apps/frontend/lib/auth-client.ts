import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:12008", // Next.js frontend URL
}) as ReturnType<typeof createAuthClient>;
