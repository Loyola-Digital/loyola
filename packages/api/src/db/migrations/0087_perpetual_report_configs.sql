-- Story 41.7 — Config do relatório de funil perpétuo (botão 3, complemento §C.2).
--
-- 1 linha por FUNIL (não por etapa: perpétuo não tem etapas — Story 29.6).
-- Guarda as premissas do relatório e o flag `validado`, que é o gate do §C.8:
-- funil não validado NÃO gera relatório (422 COMBINACAO_NAO_VALIDADA).
-- Nasce sempre `false` — sair disso é ato humano após o checklist §C.11.
--
-- O que NÃO está aqui, de propósito (correções @po 2026-07-28):
--   ad_account_id  → já é `funnels.meta_account_id`
--   campanhas      → já é `funnels.campaigns` (vínculo por ID via picker); o
--                    `prefixo_campanha` daqui é só auxiliar de DESCOBERTA, para
--                    apontar campanha que casa com o prefixo e não foi vinculada
--   expert         → já é `funnels.project_id`
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "perpetual_report_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  "prefixo_campanha" varchar(120),
  "produto" varchar(255),
  "produtos_order_bump" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "imposto_pct" numeric(6, 4),
  "taxa_plataforma_pct" numeric(6, 4),
  "taxa_imposto_pct" numeric(6, 4),
  "taxa_outros_pct" numeric(6, 4),
  "tem_split_formato" boolean DEFAULT false NOT NULL,
  "origens_pagas" jsonb DEFAULT '["meta"]'::jsonb NOT NULL,
  "inicio_trafego" date,
  "validado" boolean DEFAULT false NOT NULL,
  "validado_em" timestamp with time zone,
  "validado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "perpetual_report_configs_funnel_uniq"
  ON "perpetual_report_configs" ("funnel_id");

-- Rollback (AC1 — migration reversível):
--   DROP TABLE IF EXISTS "perpetual_report_configs";
