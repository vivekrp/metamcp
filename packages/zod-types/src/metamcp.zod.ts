import { z } from "zod";

import { McpServerTypeEnum } from "./mcp-servers.zod";
import { OAuthTokensSchema } from "./oauth.zod";

export const IOTypeSchema = z.enum(["overlapped", "pipe", "ignore", "inherit"]);

export const ServerParametersSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string(),
  type: McpServerTypeEnum.optional().default(McpServerTypeEnum.Enum.STDIO),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  env: z.record(z.string()).nullable().optional(),
  stderr: IOTypeSchema.optional().default(IOTypeSchema.Enum.ignore),
  url: z.string().nullable().optional(),
  created_at: z.string(),
  status: z.string(),
  oauth_tokens: OAuthTokensSchema.nullable().optional(),
});

export type ServerParameters = z.infer<typeof ServerParametersSchema>;
