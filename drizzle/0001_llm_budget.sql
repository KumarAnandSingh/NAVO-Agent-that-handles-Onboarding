ALTER TABLE "llm_usage" ALTER COLUMN "input_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "llm_usage" ALTER COLUMN "output_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "status" text DEFAULT 'reserved' NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_usage_day_idx" ON "llm_usage" USING btree ("day","workspace_id");