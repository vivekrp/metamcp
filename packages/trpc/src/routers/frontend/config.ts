import { SetConfigRequest, SetConfigRequestSchema } from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../../trpc";

export const createConfigRouter = (implementations: {
  getSignupDisabled: () => Promise<boolean>;
  setSignupDisabled: (input: {
    disabled: boolean;
  }) => Promise<{ success: boolean }>;
  getAllConfigs: () => Promise<
    Array<{ id: string; value: string; description?: string | null }>
  >;
  setConfig: (input: SetConfigRequest) => Promise<{ success: boolean }>;
}) =>
  router({
    getSignupDisabled: publicProcedure.query(async () => {
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
      .input(SetConfigRequestSchema)
      .mutation(async ({ input }) => {
        return await implementations.setConfig(input);
      }),
  });
