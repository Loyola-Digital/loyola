-- Epic 38 — NPS datasets por etapa (cruzamento de NPS com respostas do funil).
-- Lista de NPS subida por etapa, lida ao vivo do Google Sheets (spreadsheet +
-- sheet + column_mapping), cruzada por e-mail/nome com a pesquisa da etapa.
-- Idempotente (IF NOT EXISTS / guards).

CREATE TABLE IF NOT EXISTS "funnel_nps_datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL,
  "stage_id" uuid,
  "label" varchar(120) DEFAULT 'NPS' NOT NULL,
  "spreadsheet_id" varchar(255) NOT NULL,
  "spreadsheet_name" varchar(255) NOT NULL,
  "sheet_name" varchar(255) NOT NULL,
  "column_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'funnel_nps_datasets_funnel_id_funnels_id_fk'
      AND table_name = 'funnel_nps_datasets' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "funnel_nps_datasets"
      ADD CONSTRAINT "funnel_nps_datasets_funnel_id_funnels_id_fk"
      FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'funnel_nps_datasets_stage_id_funnel_stages_id_fk'
      AND table_name = 'funnel_nps_datasets' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "funnel_nps_datasets"
      ADD CONSTRAINT "funnel_nps_datasets_stage_id_funnel_stages_id_fk"
      FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_nps_funnel" ON "funnel_nps_datasets" USING btree ("funnel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_nps_stage" ON "funnel_nps_datasets" USING btree ("stage_id");
