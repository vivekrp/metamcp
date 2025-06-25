import { configService } from "../lib/config.service";

export const configImplementations = {
  getSignupDisabled: async (): Promise<boolean> => {
    return await configService.isSignupDisabled();
  },

  setSignupDisabled: async (input: {
    disabled: boolean;
  }): Promise<{ success: boolean }> => {
    await configService.setSignupDisabled(input.disabled);
    return { success: true };
  },

  getAllConfigs: async (): Promise<
    Array<{ id: string; value: string; description?: string | null }>
  > => {
    return await configService.getAllConfigs();
  },

  setConfig: async (input: {
    key: string;
    value: string;
    description?: string;
  }): Promise<{ success: boolean }> => {
    await configService.setConfig(
      input.key as any,
      input.value,
      input.description,
    );
    return { success: true };
  },
};
