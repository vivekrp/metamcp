import {
  DatabaseEndpoint,
  DatabaseEndpointWithNamespace,
  EndpointCreateInput,
  EndpointUpdateInput,
} from "@repo/zod-types";
import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { endpointsTable, namespacesTable } from "../schema";

export class EndpointsRepository {
  async create(input: EndpointCreateInput): Promise<DatabaseEndpoint> {
    const [createdEndpoint] = await db
      .insert(endpointsTable)
      .values({
        name: input.name,
        description: input.description,
        namespace_uuid: input.namespace_uuid,
        enable_api_key_auth: input.enable_api_key_auth ?? true,
        use_query_param_auth: input.use_query_param_auth ?? false,
      })
      .returning();

    if (!createdEndpoint) {
      throw new Error("Failed to create endpoint");
    }

    return createdEndpoint;
  }

  async findAll(): Promise<DatabaseEndpoint[]> {
    return await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .orderBy(desc(endpointsTable.created_at));
  }

  async findAllWithNamespaces(): Promise<DatabaseEndpointWithNamespace[]> {
    const endpointsData = await db
      .select({
        // Endpoint fields
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
        // Namespace fields
        namespace: {
          uuid: namespacesTable.uuid,
          name: namespacesTable.name,
          description: namespacesTable.description,
          created_at: namespacesTable.created_at,
          updated_at: namespacesTable.updated_at,
        },
      })
      .from(endpointsTable)
      .innerJoin(
        namespacesTable,
        eq(endpointsTable.namespace_uuid, namespacesTable.uuid),
      )
      .orderBy(desc(endpointsTable.created_at));

    return endpointsData;
  }

  async findByUuid(uuid: string): Promise<DatabaseEndpoint | undefined> {
    const [endpoint] = await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .where(eq(endpointsTable.uuid, uuid));

    return endpoint;
  }

  async findByUuidWithNamespace(
    uuid: string,
  ): Promise<DatabaseEndpointWithNamespace | undefined> {
    const [endpointData] = await db
      .select({
        // Endpoint fields
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
        // Namespace fields
        namespace: {
          uuid: namespacesTable.uuid,
          name: namespacesTable.name,
          description: namespacesTable.description,
          created_at: namespacesTable.created_at,
          updated_at: namespacesTable.updated_at,
        },
      })
      .from(endpointsTable)
      .innerJoin(
        namespacesTable,
        eq(endpointsTable.namespace_uuid, namespacesTable.uuid),
      )
      .where(eq(endpointsTable.uuid, uuid));

    return endpointData;
  }

  async findByName(name: string): Promise<DatabaseEndpoint | undefined> {
    const [endpoint] = await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .where(eq(endpointsTable.name, name));

    return endpoint;
  }

  async deleteByUuid(uuid: string): Promise<DatabaseEndpoint | undefined> {
    const [deletedEndpoint] = await db
      .delete(endpointsTable)
      .where(eq(endpointsTable.uuid, uuid))
      .returning();

    return deletedEndpoint;
  }

  async update(input: EndpointUpdateInput): Promise<DatabaseEndpoint> {
    const [updatedEndpoint] = await db
      .update(endpointsTable)
      .set({
        name: input.name,
        description: input.description,
        namespace_uuid: input.namespace_uuid,
        enable_api_key_auth: input.enable_api_key_auth,
        use_query_param_auth: input.use_query_param_auth,
        updated_at: new Date(),
      })
      .where(eq(endpointsTable.uuid, input.uuid))
      .returning();

    if (!updatedEndpoint) {
      throw new Error("Failed to update endpoint");
    }

    return updatedEndpoint;
  }
}

// Export the repository instance
export const endpointsRepository = new EndpointsRepository();
