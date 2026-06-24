-- Story 19.12b — planilhas de vendas do funil espelhadas na etapa de Evento.
-- O evento escolhe quais planilhas já conectadas (em outras etapas) aparecem
-- agregadas. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_event_mirrored_sheets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_stage_id" uuid NOT NULL,
  "source_spreadsheet_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_event_mirrored_sheets" ADD CONSTRAINT "stage_event_mirrored_sheets_event_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("event_stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_event_mirrored_sheets" ADD CONSTRAINT "stage_event_mirrored_sheets_source_spreadsheet_id_stage_sales_spreadsheets_id_fk"
    FOREIGN KEY ("source_spreadsheet_id") REFERENCES "public"."stage_sales_spreadsheets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_event_mirrored_event_stage" ON "stage_event_mirrored_sheets" ("event_stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_stage_event_mirrored" ON "stage_event_mirrored_sheets" ("event_stage_id", "source_spreadsheet_id");
