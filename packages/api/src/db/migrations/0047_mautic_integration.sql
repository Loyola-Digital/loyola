-- Story 32.1: Integração Mautic.
-- Conexão por projeto (credenciais Basic Auth criptografadas) + vínculo de
-- campanha Mautic por etapa (auto-match pelo nome do funil ou manual).

CREATE TABLE IF NOT EXISTS "mautic_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "base_url" varchar(500) NOT NULL,
  "username" varchar(255) NOT NULL,
  "password_encrypted" text NOT NULL,
  "password_iv" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mautic_connections_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_stage_mautic_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "mautic_campaign_id" varchar(64) NOT NULL,
  "mautic_campaign_name" varchar(500) NOT NULL,
  "match_mode" varchar(16) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "funnel_stage_mautic_campaigns_stage_id_unique" UNIQUE("stage_id")
);
--> statement-breakpoint
ALTER TABLE "mautic_connections"
  ADD CONSTRAINT "mautic_connections_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "funnel_stage_mautic_campaigns"
  ADD CONSTRAINT "funnel_stage_mautic_campaigns_stage_id_funnel_stages_id_fk"
  FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mautic_connections_project" ON "mautic_connections" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mautic_stage_campaign_stage" ON "funnel_stage_mautic_campaigns" USING btree ("stage_id");
