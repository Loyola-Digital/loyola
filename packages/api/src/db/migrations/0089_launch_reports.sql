-- Story 41.5 — persistência do Resumão (e, na 41.6, do Comparativo).
--
-- Tabela própria em vez de reusar `sprint_reports`: aquela não tem vínculo com
-- projeto/funil/etapa/período e é alimentada por API key externa (o Claude da
-- gestora). Misturar as duas confundiria a aba Sprint e o histórico da etapa.
--
-- Cada geração é uma LINHA NOVA — regenerar não sobrescreve. Ver a evolução do
-- mesmo lançamento entre gerações é o que dá auditabilidade.
--
-- `kind`: 'resumao' | 'comparativo'. O comparativo guarda as duas referências
-- de etapa/período dentro de `metricas` (jsonb), por isso não há colunas b_*.
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "launch_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "funnel_id" uuid REFERENCES "funnels"("id") ON DELETE SET NULL,
  "stage_id" uuid REFERENCES "funnel_stages"("id") ON DELETE SET NULL,
  "kind" varchar(20) NOT NULL DEFAULT 'resumao',
  "title" varchar(255) NOT NULL,
  "data_inicio" date,
  "data_fim" date,
  -- HTML autocontido, teto de 5MB aplicado na rota (mesmo de sprint_reports).
  "html" text NOT NULL,
  "metricas" jsonb,
  "alertas" jsonb,
  "gerado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Histórico da etapa: mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "launch_reports_stage_idx"
  ON "launch_reports" ("stage_id", "created_at" DESC);

-- Listagem por projeto (o Comparativo pode não ter stage_id de um lado só).
CREATE INDEX IF NOT EXISTS "launch_reports_project_idx"
  ON "launch_reports" ("project_id", "created_at" DESC);

-- Rollback (migration reversível):
--   DROP TABLE IF EXISTS "launch_reports";
