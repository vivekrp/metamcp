import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

export const createConfigRouter = (implementations: {
  getSignupDisabled: () => Promise<boolean>;
  setSignupDisabled: (input: {
    disabled: boolean;
  }) => Promise<{ success: boolean }>;
  getAllConfigs: () => Promise<
    Array<{ id: string; value: string; description?: string | null }>
  >;
  setConfig: (input: {
    key: string;
    value: string;
    description?: string;
  }) => Promise<{ success: boolean }>;
}) =>
  router({
    getSignupDisabled: protectedProcedure.query(async () => {
      return await implementations.getSignupDisabled();
    }),

    setSignupDisabled: protectedProcedure
      .input(z.object({ disabled: z.boolean() }))
      .mutation(async ({ input }) => {
        return await implementations.setSignupDisabled(input);
      }),

    getAllConfigs: protectedProcedure.query(async () => {
      return await implementations.getAllConfigs();
    }),

    setConfig: protectedProcedure
      .input(
        z.object({
          key: z.string(),
          value: z.string(),
          description: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return await implementations.setConfig(input);
      }),
  });
