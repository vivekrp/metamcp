CREATE TABLE "oauth_sessions" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"client_information" jsonb NOT NULL,
	"tokens" jsonb,
	"code_verifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_sessions_unique_per_server_idx" UNIQUE("mcp_server_uuid")
);
--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_sessions_mcp_server_uuid_idx" ON "oauth_sessions" USING btree ("mcp_server_uuid");