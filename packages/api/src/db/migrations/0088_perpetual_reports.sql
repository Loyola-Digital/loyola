-- Story 41.9 — relatórios perpétuos gerados (botão 3).
--
-- O HTML é um RETRATO: guarda o período que o gerou e as métricas do momento.
-- Regerar o mesmo período depois pode dar número diferente (planilha muda,
-- reembolso entra), e é isso que se quer — o relatório antigo continua sendo o
-- que foi conferido na época.
--
-- Segue o padrão de `sprint_reports` (HTML autocontido, teto de 5MB na rota),
-- mas com vínculo ao funil e ao período, que o sprint_reports não tem.
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "perpetual_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  "data_inicio" date NOT NULL,
  "data_fim" date NOT NULL,
  "html" text NOT NULL,
  -- Métricas do momento da geração — permite listar sem reprocessar o HTML.
  "metricas" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "alertas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gerado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "perpetual_reports_funnel_idx"
  ON "perpetual_reports" ("funnel_id", "created_at" DESC);

-- Rollback:
--   DROP TABLE IF EXISTS "perpetual_reports";
