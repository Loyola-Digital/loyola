CREATE TABLE "funnel_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "meta_account_id" uuid REFERENCES "meta_ads_accounts"("id") ON DELETE SET NULL,
  "campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "google_ads_account_id" uuid REFERENCES "google_ads_accounts"("id") ON DELETE SET NULL,
  "google_ads_campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "switchy_folder_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "switchy_linked_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "idx_funnel_stages_funnel" ON "funnel_stages" ("funnel_id");
