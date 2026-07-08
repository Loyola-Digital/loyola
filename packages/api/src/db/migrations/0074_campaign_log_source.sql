-- Log de Campanha (Story 38.2a): entradas automáticas vindas de integrações.
-- source = 'manual' | 'mautic' (futuros: meta, organic, zoom, webhook).
-- source_id deduplica o sync (ex.: 'mautic-email:123') — unique parcial por
-- funil. Aditiva e idempotente.

ALTER TABLE "campaign_log_entries" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "campaign_log_entries" ADD COLUMN IF NOT EXISTS "source_id" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_campaign_log_source" ON "campaign_log_entries" ("funnel_id", "source_id") WHERE "source_id" IS NOT NULL;
