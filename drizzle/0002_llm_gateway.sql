ALTER TABLE "llm_usage" ADD COLUMN "key_source" text DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "masked" jsonb;