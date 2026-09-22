-- Story 48.4 — Leads Pagos do Painel de Planejamento (Epic 48).
--
-- Duas tabelas-filhas de `plan_simulators` (A3 da 48.1):
--   plan_paid_blocks        — parâmetros manuais por fonte paga (4 linhas por
--                             simulador, uma por fonte);
--   plan_paid_combinations  — cenário escolhido por fonte nas cinco
--                             combinações (5 linhas por simulador).
-- Só entradas: grades, cadeia, tráfego, MC e resumo são recalculados na tela.
--
-- A tabela e os índices únicos também estão em `schema.ts` (o boot roda
-- `drizzle-kit push`); este arquivo existe para (a) aplicação manual quando o
-- push não roda e (b) os CHECKs, que o push não expressa. Conferir no
-- information_schema antes do merge (DoD da story; lição de 10/09 e 16/09).
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "plan_paid_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "simulator_id" uuid NOT NULL REFERENCES "plan_simulators"("id") ON DELETE CASCADE,
  "fonte" text NOT NULL,
  -- parâmetros manuais do bloco
  "pct_captacao" numeric(12, 6),
  "conversao_media" numeric(12, 6),
  "variacao_conversao" numeric(12, 6),
  "variacao_receita" numeric(12, 6),
  "cpl_medio_historico" numeric(18, 2),
  "faixa_variacao" numeric(12, 6),
  "fracao_cenario_1" numeric(12, 6),
  -- nível da escada assumido (radio), 1..10
  "nivel_assumido" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_paid_blocks_simulator_fonte"
  ON "plan_paid_blocks" ("simulator_id", "fonte");

CREATE TABLE IF NOT EXISTS "plan_paid_combinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "simulator_id" uuid NOT NULL REFERENCES "plan_simulators"("id") ON DELETE CASCADE,
  "indice" integer NOT NULL,
  -- cenário escolhido por fonte, 1..10 ou vazio
  "sel_meta_quente" integer,
  "sel_meta_frio" integer,
  "sel_google_quente" integer,
  "sel_google_frio" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_paid_combinations_simulator_indice"
  ON "plan_paid_combinations" ("simulator_id", "indice");

-- CHECKs (cinto; a rota valida com zod e responde 400 antes de chegar aqui).
-- Fonte no domínio do shared; frações em [0, 1]; CPL médio ≥ 0; nível 1..10;
-- índice 1..5; seleção 1..10. Vazio (NULL) é sempre permitido.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_blocks_fonte') THEN
    ALTER TABLE "plan_paid_blocks" ADD CONSTRAINT "ck_plan_paid_blocks_fonte" CHECK (
      fonte IN ('meta_quente', 'meta_frio', 'google_quente', 'google_frio')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_blocks_valores') THEN
    ALTER TABLE "plan_paid_blocks" ADD CONSTRAINT "ck_plan_paid_blocks_valores" CHECK (
      (pct_captacao IS NULL OR pct_captacao BETWEEN 0 AND 1) AND
      (conversao_media IS NULL OR conversao_media BETWEEN 0 AND 1) AND
      (variacao_conversao IS NULL OR variacao_conversao BETWEEN 0 AND 1) AND
      (variacao_receita IS NULL OR variacao_receita BETWEEN 0 AND 1) AND
      (cpl_medio_historico IS NULL OR cpl_medio_historico >= 0) AND
      (faixa_variacao IS NULL OR faixa_variacao BETWEEN 0 AND 1) AND
      (fracao_cenario_1 IS NULL OR fracao_cenario_1 BETWEEN 0 AND 1) AND
      (nivel_assumido IS NULL OR nivel_assumido BETWEEN 1 AND 10)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_combinations_valores') THEN
    ALTER TABLE "plan_paid_combinations" ADD CONSTRAINT "ck_plan_paid_combinations_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (sel_meta_quente IS NULL OR sel_meta_quente BETWEEN 1 AND 10) AND
      (sel_meta_frio IS NULL OR sel_meta_frio BETWEEN 1 AND 10) AND
      (sel_google_quente IS NULL OR sel_google_quente BETWEEN 1 AND 10) AND
      (sel_google_frio IS NULL OR sel_google_frio BETWEEN 1 AND 10)
    );
  END IF;
END $$;

-- Rollback:
-- DROP TABLE IF EXISTS "plan_paid_combinations";
-- DROP TABLE IF EXISTS "plan_paid_blocks";
