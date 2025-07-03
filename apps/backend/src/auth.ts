import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";

import { db } from "./db/index";
import * as schema from "./db/schema";
import { configService } from "./lib/config.service";

// Provide default values for development
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}
if (!process.env.APP_URL) {
  throw new Error("APP_URL environment variable is required");
}

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.APP_URL;

// OIDC Provider configuration - optional, only if environment variables are provided
const oidcProviders = [];

// Add OIDC provider if configured
if (process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET) {
  const oidcConfig = {
    providerId: process.env.OIDC_PROVIDER_ID || "oidc",
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    scopes: (process.env.OIDC_SCOPES || "openid email profile").split(" "),
    pkce: process.env.OIDC_PKCE === "true" || true, // Enable PKCE by default for security
  };

  // Use discovery URL if provided, otherwise manual configuration
  if (process.env.OIDC_DISCOVERY_URL) {
    oidcConfig.discoveryUrl = process.env.OIDC_DISCOVERY_URL;
  } else {
    // Manual endpoint configuration
    if (process.env.OIDC_AUTHORIZATION_URL) {
      oidcConfig.authorizationUrl = process.env.OIDC_AUTHORIZATION_URL;
    }
    if (process.env.OIDC_TOKEN_URL) {
      oidcConfig.tokenUrl = process.env.OIDC_TOKEN_URL;
    }
    if (process.env.OIDC_USERINFO_URL) {
      oidcConfig.userInfoUrl = process.env.OIDC_USERINFO_URL;
    }
  }

  // Optional: Custom user info mapping
  if (process.env.OIDC_CUSTOM_USER_MAPPING === "true") {
    oidcConfig.mapProfileToUser = async (profile) => {
      return {
        firstName: profile.given_name || profile.first_name,
        lastName: profile.family_name || profile.last_name,
        // Add any other custom field mappings here
      };
    };
  }

  oidcProviders.push(oidcConfig);
}

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.usersTable,
      session: schema.sessionsTable,
      account: schema.accountsTable,
      verification: schema.verificationsTable,
    },
  }),
  plugins: [
    // Add generic OAuth plugin for OIDC support
    ...(oidcProviders.length > 0 ? [genericOAuth({ config: oidcProviders })] : []),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true if you want email verification
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (how often to update the session)
  },
  user: {
    additionalFields: {
      emailVerified: {
        type: "boolean",
        defaultValue: false,
      },
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
    },
  },
  logger: {
    level: "debug", // Enable debug logging
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Check if signup is disabled
          const isSignupDisabled = await configService.isSignupDisabled();
          if (isSignupDisabled) {
            throw new Error("New user registration is currently disabled.");
          }
          return { data: user };
        },
      },
    },
  },
});

console.log("✓ Better Auth instance created successfully");
console.log(`✓ OIDC Providers configured: ${oidcProviders.length}`);

export type Session = typeof auth.$Infer.Session;
// Note: User type needs to be inferred from Session.user
export type User = typeof auth.$Infer.Session.user;
