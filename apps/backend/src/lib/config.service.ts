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
};
