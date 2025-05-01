ALTER TABLE "tool_execution_logs" DROP CONSTRAINT "tool_execution_logs_mcp_server_uuid_mcp_servers_uuid_fk";
--> statement-breakpoint
ALTER TABLE "tool_execution_logs" ADD CONSTRAINT "tool_execution_logs_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;