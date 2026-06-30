-- Epic 37 — Integração GA4 (Google Analytics Data API).
--   1. ga4_connections: conexão OAuth por projeto (refresh_token cifrado +
--      property GA4 selecionada). access_token (1h) obtido em runtime, NUNCA salvo.
--   2. funnel_stages.ga4_page_filter: página (substring de landingPagePlusQueryString)
--      que cada etapa analisa. NULL = etapa sem GA4.
-- Idempotente (IF NOT EXISTS / guards).

CREATE TABLE IF NOT EXISTS "ga4_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "refresh_token_iv" text NOT NULL,
  "property_id" varchar(32) NOT NULL,
  "property_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ga4_connections_project_id_unique" UNIQUE ("project_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ga4_connections_project_id_projects_id_fk'
      AND table_name = 'ga4_connections' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "ga4_connections"
      ADD CONSTRAINT "ga4_connections_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ga4_connections_project" ON "ga4_connections" USING btree ("project_id");
--> statement-breakpoint
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "ga4_page_filter" text;
