-- CRM Comercial (Story 40.1 iter): rastreio de ligação no card —
-- Atendeu / Não atendeu + "Liguei X vezes". Aditiva e idempotente.

ALTER TABLE "stage_crm_cards" ADD COLUMN IF NOT EXISTS "call_status" varchar(12);--> statement-breakpoint
ALTER TABLE "stage_crm_cards" ADD COLUMN IF NOT EXISTS "call_count" integer NOT NULL DEFAULT 0;
