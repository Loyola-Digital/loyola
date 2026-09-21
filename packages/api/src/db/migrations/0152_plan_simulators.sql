-- Story 48.1 — Inputs Financeiros do Painel de Planejamento (Epic 48).
--
-- UMA linha por funil de lançamento: as 20 entradas manuais da aba 1 da
-- planilha, com os nomes normalizados da spec (docs/specs/epic-48, §1.1).
-- Nenhum derivado é gravado — a conta vive no shared e roda na tela.
--
-- A tabela e o índice único também estão declarados em `schema.ts` (o boot
-- roda `drizzle-kit push`); este arquivo existe para (a) aplicação manual
-- quando o push não roda e (b) os CHECKs, que o push não expressa. Conferir
-- no information_schema antes do merge (DoD da story; lição de 10/09 e 16/09).
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "plan_simulators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL REFERENCES "funnels"("id") ON DELETE CASCADE,
  -- custos variáveis (frações da receita bruta)
  "pct_reembolso" numeric(12, 6),
  "pct_marketplace" numeric(12, 6),
  "pct_imposto" numeric(12, 6),
  "pct_custo_produto" numeric(12, 6),
  "pct_comissoes" numeric(12, 6),
  "pct_outros_custos" numeric(12, 6),
  -- metas
  "meta_margem_total" numeric(18, 2),
  "pct_margem_pagos" numeric(12, 6),
  "ticket_medio" numeric(18, 2),
  "mc_alvo_pagos" numeric(12, 6),
  -- investimento
  "investimento_anuncios" numeric(18, 2),
  "pct_invest_meta" numeric(12, 6),
  "pct_meta_quente" numeric(12, 6),
  "pct_google_quente" numeric(12, 6),
  -- metas por canal orgânico (frações da meta de margem dos orgânicos)
  "pct_org_whatsapp" numeric(12, 6),
  "pct_org_email" numeric(12, 6),
  "pct_org_instagram" numeric(12, 6),
  "pct_org_telegram" numeric(12, 6),
  "pct_org_youtube" numeric(12, 6),
  "pct_org_area_membros" numeric(12, 6),
  -- bases (contagens)
  "base_whatsapp" integer,
  "base_email" integer,
  "base_instagram" integer,
  "base_telegram" integer,
  "base_youtube" integer,
  "base_area_membros" integer,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_simulators_funnel_id"
  ON "plan_simulators" ("funnel_id");

-- CHECKs (cinto; a rota valida com zod e responde 400 antes de chegar aqui).
-- Frações em [0, 1]; moeda ≥ 0; ticket > 0; margem-alvo dos pagos em (0, 1];
-- bases ≥ 0. Vazio (NULL) é sempre permitido.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_simulators_fracoes') THEN
    ALTER TABLE "plan_simulators" ADD CONSTRAINT "ck_plan_simulators_fracoes" CHECK (
      (pct_reembolso IS NULL OR pct_reembolso BETWEEN 0 AND 1) AND
      (pct_marketplace IS NULL OR pct_marketplace BETWEEN 0 AND 1) AND
      (pct_imposto IS NULL OR pct_imposto BETWEEN 0 AND 1) AND
      (pct_custo_produto IS NULL OR pct_custo_produto BETWEEN 0 AND 1) AND
      (pct_comissoes IS NULL OR pct_comissoes BETWEEN 0 AND 1) AND
      (pct_outros_custos IS NULL OR pct_outros_custos BETWEEN 0 AND 1) AND
      (pct_margem_pagos IS NULL OR pct_margem_pagos BETWEEN 0 AND 1) AND
      (mc_alvo_pagos IS NULL OR (mc_alvo_pagos > 0 AND mc_alvo_pagos <= 1)) AND
      (pct_invest_meta IS NULL OR pct_invest_meta BETWEEN 0 AND 1) AND
      (pct_meta_quente IS NULL OR pct_meta_quente BETWEEN 0 AND 1) AND
      (pct_google_quente IS NULL OR pct_google_quente BETWEEN 0 AND 1) AND
      (pct_org_whatsapp IS NULL OR pct_org_whatsapp BETWEEN 0 AND 1) AND
      (pct_org_email IS NULL OR pct_org_email BETWEEN 0 AND 1) AND
      (pct_org_instagram IS NULL OR pct_org_instagram BETWEEN 0 AND 1) AND
      (pct_org_telegram IS NULL OR pct_org_telegram BETWEEN 0 AND 1) AND
      (pct_org_youtube IS NULL OR pct_org_youtube BETWEEN 0 AND 1) AND
      (pct_org_area_membros IS NULL OR pct_org_area_membros BETWEEN 0 AND 1)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_simulators_valores') THEN
    ALTER TABLE "plan_simulators" ADD CONSTRAINT "ck_plan_simulators_valores" CHECK (
      (meta_margem_total IS NULL OR meta_margem_total >= 0) AND
      (ticket_medio IS NULL OR ticket_medio > 0) AND
      (investimento_anuncios IS NULL OR investimento_anuncios >= 0) AND
      (base_whatsapp IS NULL OR base_whatsapp >= 0) AND
      (base_email IS NULL OR base_email >= 0) AND
      (base_instagram IS NULL OR base_instagram >= 0) AND
      (base_telegram IS NULL OR base_telegram >= 0) AND
      (base_youtube IS NULL OR base_youtube >= 0) AND
      (base_area_membros IS NULL OR base_area_membros >= 0)
    );
  END IF;
END $$;

-- Rollback:
-- DROP TABLE IF EXISTS "plan_simulators";
