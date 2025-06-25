import {
  BulkImportMcpServersRequestSchema,
  BulkImportMcpServersResponseSchema,
  CreateMcpServerRequestSchema,
  CreateMcpServerResponseSchema,
  DeleteMcpServerResponseSchema,
  GetMcpServerResponseSchema,
  ListMcpServersResponseSchema,
  UpdateMcpServerRequestSchema,
  UpdateMcpServerResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

// Define the MCP servers router with procedure definitions
// The actual implementation will be provided by the backend
export const createMcpServersRouter = (
  // These are the implementation functions that the backend will provide
  implementations: {
    create: (
      input: z.infer<typeof CreateMcpServerRequestSchema>,
    ) => Promise<z.infer<typeof CreateMcpServerResponseSchema>>;
    list: () => Promise<z.infer<typeof ListMcpServersResponseSchema>>;
    bulkImport: (
      input: z.infer<typeof BulkImportMcpServersRequestSchema>,
    ) => Promise<z.infer<typeof BulkImportMcpServersResponseSchema>>;
    get: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof GetMcpServerResponseSchema>>;
    delete: (input: {
      uuid: string;
    }) => Promise<z.infer<typeof DeleteMcpServerResponseSchema>>;
    update: (
      input: z.infer<typeof UpdateMcpServerRequestSchema>,
    ) => Promise<z.infer<typeof UpdateMcpServerResponseSchema>>;
  },
) => {
  return router({
    // Protected: List all MCP servers
    list: protectedProcedure
      .output(ListMcpServersResponseSchema)
      .query(async () => {
        return await implementations.list();
      }),

    // Protected: Get single MCP server by UUID
    get: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(GetMcpServerResponseSchema)
      .query(async ({ input }) => {
        return await implementations.get(input);
      }),

    // Protected: Create MCP server
    create: protectedProcedure
      .input(CreateMcpServerRequestSchema)
      .output(CreateMcpServerResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.create(input);
      }),

    // Protected: Bulk import MCP servers
    bulkImport: protectedProcedure
      .input(BulkImportMcpServersRequestSchema)
      .output(BulkImportMcpServersResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.bulkImport(input);
      }),

    // Protected: Delete MCP server
    delete: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .output(DeleteMcpServerResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.delete(input);
      }),

    // Protected: Update MCP server
    update: protectedProcedure
      .input(UpdateMcpServerRequestSchema)
      .output(UpdateMcpServerResponseSchema)
      .mutation(async ({ input }) => {
        return await implementations.update(input);
      }),
  });
};
