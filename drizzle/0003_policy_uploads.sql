ALTER TABLE "policy_documents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD COLUMN "replaces" text;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_documents_workspace_idx" ON "policy_documents" USING btree ("workspace_id");