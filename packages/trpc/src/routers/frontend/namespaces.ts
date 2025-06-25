import {
  CreateNamespaceRequestSchema,
  CreateNamespaceResponseSchema,
  DeleteNamespaceResponseSchema,
  GetNamespaceResponseSchema,
  GetNamespaceToolsRequestSchema,
  GetNamespaceToolsResponseSchema,
  ListNamespacesResponseSchema,
  RefreshNamespaceToolsRequestSchema,
  RefreshNamespaceToolsResponseSchema,
  UpdateNamespaceRequestSchema,
  UpdateNamespaceResponseSchema,
  UpdateNamespaceServerStatusRequestSchema,
  UpdateNamespaceServerStatusResponseSchema,
  UpdateNamespaceToolStatusRequestSchema,
  UpdateNamespaceToolStatusResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

// Define the namespaces router with procedure definitions
// The actual implementation will be provided by the backend
export const createNamespacesRouter = (
  // These are the implementation functions that the backend will provide
  implementations: {
    create: (
      input: z.infer<typeof CreateNamespaceRequestSchema>,
    ) => Promise<z.infer<typeof CreateNamespaceResponseSchema>>;
    list: () => Promise<z.infer<typeof ListNamespacesResponseSchema>>;
    get: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof GetNamespaceResponseSchema>>;
    getTools: (
      input: z.infer<typeof GetNamespaceToolsRequestSchema>,
    ) => Promise<z.infer<typeof GetNamespaceToolsResponseSchema>>;
    delete: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof DeleteNamespaceResponseSchema>>;
    update: (
      input: z.infer<typeof UpdateNamespaceRequestSchema>,
    ) => Promise<z.infer<typeof UpdateNamespaceResponseSchema>>;
    updateServerStatus: (
      input: z.infer<typeof UpdateNamespaceServerStatusRequestSchema>,
    ) => Promise<z.infer<typeof UpdateNamespaceServerStatusResponseSchema>>;
    updateToolStatus: (
      input: z.infer<typeof UpdateNamespaceToolStatusRequestSchema>,
    ) => Promise<z.infer<typeof UpdateNamespaceToolStatusResponseSchema>>;
    refreshTools: (
      input: z.infer<typeof RefreshNamespaceToolsRequestSchema>,
    ) => Promise<z.infer<typeof RefreshNamespaceToolsResponseSchema>>;
  },
) => {
  return router({
    // Protected: List all namespaces
    list: protectedProcedure
      .output(ListNamespacesResponseSchema)
      .query(async () => {
        return await implementations.list();
      }),

    // Protected: Get single namespace by UUID
    get: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(GetNamespaceResponseSchema)
      .query(async ({ input }) => {
        return await implementations.get(input);
      }),

    // Protected: Get tools for namespace from mapping table
    getTools: protectedProcedure
      .input(GetNamespaceToolsRequestSchema)
      .output(GetNamespaceToolsResponseSchema)
      .query(async ({ input }) => {
        return await implementations.getTools(input);
      }),

    // Protected: Create namespace
    create: protectedProcedure
      .input(CreateNamespaceRequestSchema)
      .output(CreateNamespaceResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.create(input);
      }),

    // Protected: Delete namespace
    delete: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(DeleteNamespaceResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.delete(input);
      }),

    // Protected: Update namespace
    update: protectedProcedure
      .input(UpdateNamespaceRequestSchema)
      .output(UpdateNamespaceResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.update(input);
      }),

    // Protected: Update server status within namespace
    updateServerStatus: protectedProcedure
      .input(UpdateNamespaceServerStatusRequestSchema)
      .output(UpdateNamespaceServerStatusResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.updateServerStatus(input);
      }),

    // Protected: Update tool status within namespace
    updateToolStatus: protectedProcedure
      .input(UpdateNamespaceToolStatusRequestSchema)
      .output(UpdateNamespaceToolStatusResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.updateToolStatus(input);
      }),

    // Protected: Refresh tools from MetaMCP connection
    refreshTools: protectedProcedure
      .input(RefreshNamespaceToolsRequestSchema)
      .output(RefreshNamespaceToolsResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.refreshTools(input);
      }),
  });
};
