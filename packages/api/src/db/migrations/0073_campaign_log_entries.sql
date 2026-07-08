-- Log de Campanha (Epic 38 / Story 38.1): registro fixo por funil das ações
-- executadas na campanha (disparos, publicações, ajustes). Substitui a
-- planilha manual. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "campaign_log_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  "occurred_at" timestamptz NOT NULL,
  "evento" varchar(80) NOT NULL,
  "aplicativo" varchar(80),
  "categoria" varchar(80),
  "notes" text,
  "responsavel" varchar(255),
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_log_funnel_occurred" ON "campaign_log_entries" ("funnel_id", "occurred_at" DESC);
