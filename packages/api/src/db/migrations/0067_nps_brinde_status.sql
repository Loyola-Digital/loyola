-- Epic 38 — status do brinde por respondente do NPS (marcado no evento).
-- Idempotente (IF NOT EXISTS / guards).

CREATE TABLE IF NOT EXISTS "nps_brinde_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dataset_id" uuid NOT NULL,
  "respondent_key" varchar(255) NOT NULL,
  "delivered" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_nps_brinde_dataset_respondent" UNIQUE ("dataset_id", "respondent_key")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nps_brinde_status_dataset_id_funnel_nps_datasets_id_fk'
      AND table_name = 'nps_brinde_status' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "nps_brinde_status"
      ADD CONSTRAINT "nps_brinde_status_dataset_id_funnel_nps_datasets_id_fk"
      FOREIGN KEY ("dataset_id") REFERENCES "public"."funnel_nps_datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_brinde_dataset" ON "nps_brinde_status" USING btree ("dataset_id");
