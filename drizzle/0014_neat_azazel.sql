CREATE TYPE "public"."workspace_mode" AS ENUM('REMOTE', 'LOCAL');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "workspace_mode" "workspace_mode" DEFAULT 'LOCAL' NOT NULL;