-- Story 33.1: Switchy Link Generator — schema (settings, presets, shortened links).
-- Settings por projeto (pixels + defaults de UTM), presets de canal editáveis e
-- histórico de shortlinks gerados. Token Switchy é GLOBAL (SWITCHY_API_TOKEN).
-- Seed dos 7 presets default é lazy/por-projeto (rota GET /switchy/presets),
-- NÃO roda nesta migration. Todas as FKs com ON DELETE cascade para projects.

CREATE TABLE IF NOT EXISTS "project_switchy_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "pixels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "show_gdpr" boolean DEFAULT false NOT NULL,
  "default_utm_term" varchar(120),
  "default_utm_content" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_switchy_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "switchy_channel_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "label" varchar(120) NOT NULL,
  "utm_medium" varchar(120) NOT NULL,
  "utm_source" varchar(120) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "switchy_shortened_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "folder_id" varchar(64) NOT NULL,
  "folder_name" varchar(500),
  "checkout_base_url" text NOT NULL,
  "channel_label" varchar(120),
  "utm_campaign" varchar(120),
  "utm_medium" varchar(120),
  "utm_source" varchar(120),
  "utm_term" varchar(120),
  "utm_content" varchar(120),
  "sck" text,
  "vk_source" text,
  "full_url" text NOT NULL,
  "short_url" text,
  "switchy_link_id" varchar(255),
  "switchy_uniq" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_switchy_settings"
  ADD CONSTRAINT "project_switchy_settings_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "switchy_channel_presets"
  ADD CONSTRAINT "switchy_channel_presets_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "switchy_shortened_links"
  ADD CONSTRAINT "switchy_shortened_links_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_switchy_settings_project" ON "project_switchy_settings" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_switchy_presets_project" ON "switchy_channel_presets" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_switchy_links_project" ON "switchy_shortened_links" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_switchy_links_created_at" ON "switchy_shortened_links" USING btree ("created_at");
