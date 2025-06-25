import {
  CreateEndpointRequestSchema,
  CreateEndpointResponseSchema,
  DeleteEndpointResponseSchema,
  GetEndpointResponseSchema,
  ListEndpointsResponseSchema,
  UpdateEndpointRequestSchema,
  UpdateEndpointResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

// Define the endpoints router with procedure definitions
// The actual implementation will be provided by the backend
export const createEndpointsRouter = (
  // These are the implementation functions that the backend will provide
  implementations: {
    create: (
      input: z.infer<typeof CreateEndpointRequestSchema>,
      userId: string,
    ) => Promise<z.infer<typeof CreateEndpointResponseSchema>>;
    list: () => Promise<z.infer<typeof ListEndpointsResponseSchema>>;
    get: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof GetEndpointResponseSchema>>;
    delete: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof DeleteEndpointResponseSchema>>;
    update: (
      input: z.infer<typeof UpdateEndpointRequestSchema>,
    ) => Promise<z.infer<typeof UpdateEndpointResponseSchema>>;
  },
) => {
  return router({
    // Protected: List all endpoints
    list: protectedProcedure
      .output(ListEndpointsResponseSchema)
      .query(async () => {
        return await implementations.list();
      }),

    // Protected: Get single endpoint by UUID
    get: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(GetEndpointResponseSchema)
      .query(async ({ input }) => {
        return await implementations.get(input);
      }),

    // Protected: Create endpoint
    create: protectedProcedure
      .input(CreateEndpointRequestSchema)
      .output(CreateEndpointResponseSchema)
      .mutation(async ({ input, ctx }) => {
        return await implementations.create(input, ctx.user.id);
      }),

    // Protected: Delete endpoint
    delete: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(DeleteEndpointResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.delete(input);
      }),

    // Protected: Update endpoint
    update: protectedProcedure
      .input(UpdateEndpointRequestSchema)
      .output(UpdateEndpointResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.update(input);
      }),
  });
};
