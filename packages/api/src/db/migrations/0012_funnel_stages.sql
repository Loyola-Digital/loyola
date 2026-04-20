-- EPIC-19: Funnel Stages
CREATE TABLE IF NOT EXISTS "funnel_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "meta_account_id" uuid REFERENCES "meta_ads_accounts"("id") ON DELETE SET NULL,
  "campaigns" jsonb NOT NULL DEFAULT '[]',
  "google_ads_account_id" uuid REFERENCES "google_ads_accounts"("id") ON DELETE SET NULL,
  "google_ads_campaigns" jsonb NOT NULL DEFAULT '[]',
  "switchy_folder_ids" jsonb NOT NULL DEFAULT '[]',
  "switchy_linked_links" jsonb NOT NULL DEFAULT '[]',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_funnel_stages_funnel" ON "funnel_stages" ("funnel_id");
