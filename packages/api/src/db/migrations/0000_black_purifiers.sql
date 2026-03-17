CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('urgent', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'open', 'in_progress', 'review', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('copywriter', 'strategist', 'manager', 'admin');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mind_id" text NOT NULL,
	"mind_name" text NOT NULL,
	"squad_id" text NOT NULL,
	"title" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"project_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_message_count_positive" CHECK (message_count >= 0),
	CONSTRAINT "chk_total_tokens_positive" CHECK (total_tokens >= 0)
);
--> statement-breakpoint
CREATE TABLE "delegated_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"user_id" uuid NOT NULL,
	"mind_id" text NOT NULL,
	"clickup_task_id" text NOT NULL,
	"clickup_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_task_title_not_empty" CHECK (length(title) > 0),
	CONSTRAINT "chk_task_clickup_url" CHECK (clickup_url LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "instagram_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"instagram_user_id" varchar(50) NOT NULL,
	"instagram_username" varchar(50),
	"access_token_encrypted" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"profile_picture_url" text,
	"project_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_metrics_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"metric_data" jsonb NOT NULL,
	"period_start" date,
	"period_end" date,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_ig_metrics_account_type_period" UNIQUE("account_id","metric_type","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"tokens_used" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_message_content_not_empty" CHECK (length(content) > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"client_name" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7),
	"created_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'copywriter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_tasks" ADD CONSTRAINT "delegated_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_tasks" ADD CONSTRAINT "delegated_tasks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_tasks" ADD CONSTRAINT "delegated_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_metrics_cache" ADD CONSTRAINT "instagram_metrics_cache_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversations_user_updated" ON "conversations" USING btree ("user_id","updated_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_conversations_user_mind" ON "conversations" USING btree ("user_id","mind_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_conversations_project" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_user_created" ON "delegated_tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_user_status" ON "delegated_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_conversation" ON "delegated_tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tasks_clickup_task_id" ON "delegated_tasks" USING btree ("clickup_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ig_accounts_instagram_user_id" ON "instagram_accounts" USING btree ("instagram_user_id");--> statement-breakpoint
CREATE INDEX "idx_ig_accounts_user" ON "instagram_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ig_accounts_project" ON "instagram_accounts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_ig_metrics_account" ON "instagram_metrics_cache" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_ig_metrics_expires" ON "instagram_metrics_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_projects_created_by" ON "projects" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_clerk_id" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");