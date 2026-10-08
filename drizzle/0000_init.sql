CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"run_id" integer,
	"case_key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"phase" text NOT NULL,
	"summary" text NOT NULL,
	"related_task_id" text,
	"action" text,
	"user_visible" boolean DEFAULT true NOT NULL,
	"headline" text,
	"headline_detail" text
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text,
	"event_id" integer,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_from" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "approvals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "benefit_enrollments" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"plan" text NOT NULL,
	"coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"enrolled_at" timestamp with time zone,
	CONSTRAINT "benefit_enrollments_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"with_person_id" text,
	"owner_type" text NOT NULL,
	"task_id" text,
	CONSTRAINT "calendar_events_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "counters_workspace_id_name_pk" PRIMARY KEY("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "dependencies" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"prerequisite_task_id" text NOT NULL,
	"dependent_task_id" text NOT NULL,
	"type" text DEFAULT 'blocks' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "dependencies_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"masked_value" text,
	"sample_id" text,
	"extracted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_by" text,
	"uploaded_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "documents_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"workspace_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"manager_id" text NOT NULL,
	"buddy_id" text,
	"hr_owner_id" text NOT NULL,
	"location" text NOT NULL,
	"work_mode" text NOT NULL,
	"joining_date" text NOT NULL,
	"employment_status" text NOT NULL,
	"employee_number" text,
	"home_area" text,
	"family" jsonb,
	"featured" boolean DEFAULT false NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "employees_workspace_id_person_id_pk" PRIMARY KEY("workspace_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "facilities_items" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"item" text NOT NULL,
	"status" text NOT NULL,
	"location" text NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "facilities_items_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"to_person_id" text NOT NULL,
	"cc_person_id" text,
	"message" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "follow_ups_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"form" text NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "form_fields_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "hr_requests" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"assignee_id" text NOT NULL,
	"note" text NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "hr_requests_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "it_tickets" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expected_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "it_tickets_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"composed_by" text DEFAULT 'template' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"team" text,
	CONSTRAINT "people_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"effective_date" text NOT NULL,
	"superseded_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "policy_documents_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "policy_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"version" text NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pulse_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"score" integer NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" integer,
	"label" text NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"at" timestamp with time zone NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"phase" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text,
	"status" text NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"due_at" timestamp with time zone,
	"lead_working_days" integer DEFAULT 0 NOT NULL,
	"required_for_day1" boolean DEFAULT false NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"next_action" text,
	"status_note" text,
	"risk_level" text DEFAULT 'none' NOT NULL,
	"risk_reason" text,
	"source_system" text DEFAULT 'navo' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tasks_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" integer,
	"seq" integer NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"args_summary" text NOT NULL,
	"result_summary" text NOT NULL,
	"guard" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_enrollments" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"course" text NOT NULL,
	"minutes" integer NOT NULL,
	"status" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "training_enrollments_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "vendor_checks" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"expected_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "vendor_checks_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario" text NOT NULL,
	"sim_now" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed_version" integer NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_workspace_id_prerequisite_task_id_tasks_workspace_id_id_fk" FOREIGN KEY ("workspace_id","prerequisite_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_workspace_id_dependent_task_id_tasks_workspace_id_id_fk" FOREIGN KEY ("workspace_id","dependent_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_workspace_id_person_id_people_workspace_id_id_fk" FOREIGN KEY ("workspace_id","person_id") REFERENCES "public"."people"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities_items" ADD CONSTRAINT "facilities_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_tickets" ADD CONSTRAINT "it_tickets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_sections" ADD CONSTRAINT "policy_sections_document_id_version_policy_documents_id_version_fk" FOREIGN KEY ("document_id","version") REFERENCES "public"."policy_documents"("id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_responses" ADD CONSTRAINT "pulse_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_changes" ADD CONSTRAINT "state_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_checks" ADD CONSTRAINT "vendor_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_employee_idx" ON "activities" USING btree ("workspace_id","employee_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_idx" ON "events" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "events_due_idx" ON "events" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_employee_idx" ON "tasks" USING btree ("workspace_id","employee_id");--> statement-breakpoint
CREATE INDEX "tool_calls_run_idx" ON "tool_calls" USING btree ("workspace_id","run_id");