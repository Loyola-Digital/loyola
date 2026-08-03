-- Story 41.1 — Config do gerador de Resumão/Comparativo.
--
-- launch_report_configs: 1 linha por ETAPA. Define tipo/etapa/entidade de
-- captura, período opcional e o flag `validado`, que é o gate do §12 da spec:
-- combinação não validada NÃO gera relatório (422 COMBINACAO_NAO_VALIDADA).
-- Nasce sempre `false` — sair disso é ato humano após conferência manual.
--
-- expert_report_configs: 1 linha por PROJETO (o "expert"). Override de imposto
-- e mapa dos campos canônicos da pesquisa (cada expert tem formulário próprio).
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "launch_report_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "tipo" varchar(20) NOT NULL,
  "etapa" varchar(30) NOT NULL,
  "entidade_captura" varchar(10) NOT NULL,
  "data_inicio" date,
  "data_fim" date,
  "imposto_pct" numeric(6, 4),
  "validado" boolean DEFAULT false NOT NULL,
  "validado_em" timestamp with time zone,
  "validado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "launch_report_configs_stage_uniq"
  ON "launch_report_configs" ("stage_id");

CREATE TABLE IF NOT EXISTS "expert_report_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "imposto_pct" numeric(6, 4),
  "campos_pesquisa" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "expert_report_configs_project_uniq"
  ON "expert_report_configs" ("project_id");

-- Rollback (AC1 — migration reversível):
--   DROP TABLE IF EXISTS "expert_report_configs";
--   DROP TABLE IF EXISTS "launch_report_configs";
