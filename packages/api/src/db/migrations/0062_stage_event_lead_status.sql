-- Story 19.13 — Mapa do Evento: status de cada lead na etapa de Evento.
-- "comprou" é derivado das vendas manuais; aqui guardamos negativa / em
-- negociação / pendente. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_event_lead_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "lead_email" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "note" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_event_lead_status" ADD CONSTRAINT "stage_event_lead_status_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_event_lead_status_stage" ON "stage_event_lead_status" ("stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_stage_event_lead_status" ON "stage_event_lead_status" ("stage_id", "lead_email");
