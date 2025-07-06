import { ConfigKey, ConfigKeyEnum } from "@repo/zod-types";

import { configRepo } from "../db/repositories/config.repo";

export const configService = {
  async isSignupDisabled(): Promise<boolean> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.Enum.DISABLE_SIGNUP,
    );
    return config?.value === "true";
  },

  async setSignupDisabled(disabled: boolean): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.Enum.DISABLE_SIGNUP,
      disabled.toString(),
      "Whether new user signup is disabled",
    );
  },

  async getConfig(key: ConfigKey): Promise<string | undefined> {
    const config = await configRepo.getConfig(key);
    return config?.value;
  },

  async setConfig(
    key: ConfigKey,
    value: string,
    description?: string,
  ): Promise<void> {
    await configRepo.setConfig(key, value, description);
  },

  async getAllConfigs(): Promise<
    Array<{ id: string; value: string; description?: string | null }>
  > {
    return await configRepo.getAllConfigs();
  },

  async getAuthProviders(): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
    const providers = [];

    // Check if OIDC is configured
    const isOidcEnabled = !!(
      process.env.OIDC_CLIENT_ID && 
      process.env.OIDC_CLIENT_SECRET &&
      process.env.OIDC_DISCOVERY_URL
    );

    if (isOidcEnabled) {
      providers.push({
        id: "oidc",
        name: "OIDC",
        enabled: true,
      });
    }

    return providers;
  },
};
