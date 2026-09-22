-- Story 48.3 — Leads Orgânicos do Painel de Planejamento (Epic 48).
--
-- Duas tabelas-filhas de `plan_simulators` (A3 da 48.1):
--   plan_organic_blocks        — parâmetros manuais por canal orgânico (6 linhas
--                                por simulador, uma por canal);
--   plan_organic_combinations  — cenário escolhido por canal nas cinco
--                                combinações (5 linhas por simulador).
-- Só entradas: grades, cadeia de deduções e resumo são recalculados na tela.
--
-- A tabela e os índices únicos também estão em `schema.ts` (o boot roda
-- `drizzle-kit push`); este arquivo existe para (a) aplicação manual quando o
-- push não roda e (b) os CHECKs, que o push não expressa. Conferir no
-- information_schema antes do merge (DoD da story; lição de 10/09 e 16/09).
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "plan_organic_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "simulator_id" uuid NOT NULL REFERENCES "plan_simulators"("id") ON DELETE CASCADE,
  "canal" text NOT NULL,
  -- parâmetros manuais do bloco (frações)
  "conversao_media" numeric(12, 6),
  "variacao_conversao" numeric(12, 6),
  "variacao_receita" numeric(12, 6),
  "taxa_captacao" numeric(12, 6),
  "faixa_variacao" numeric(12, 6),
  "fracao_cenario_1" numeric(12, 6),
  -- nível da escada assumido (radio), 1..8
  "nivel_assumido" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_organic_blocks_simulator_canal"
  ON "plan_organic_blocks" ("simulator_id", "canal");

CREATE TABLE IF NOT EXISTS "plan_organic_combinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "simulator_id" uuid NOT NULL REFERENCES "plan_simulators"("id") ON DELETE CASCADE,
  "indice" integer NOT NULL,
  -- cenário escolhido por canal, 1..10 ou vazio
  "sel_whatsapp" integer,
  "sel_email" integer,
  "sel_instagram" integer,
  "sel_telegram" integer,
  "sel_youtube" integer,
  "sel_area_membros" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_organic_combinations_simulator_indice"
  ON "plan_organic_combinations" ("simulator_id", "indice");

-- CHECKs (cinto; a rota valida com zod e responde 400 antes de chegar aqui).
-- Canal no domínio do shared; frações em [0, 1]; nível 1..8; índice 1..5;
-- seleção 1..10. Vazio (NULL) é sempre permitido.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_blocks_canal') THEN
    ALTER TABLE "plan_organic_blocks" ADD CONSTRAINT "ck_plan_organic_blocks_canal" CHECK (
      canal IN ('whatsapp', 'email', 'instagram', 'telegram', 'youtube', 'area_membros')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_blocks_valores') THEN
    ALTER TABLE "plan_organic_blocks" ADD CONSTRAINT "ck_plan_organic_blocks_valores" CHECK (
      (conversao_media IS NULL OR conversao_media BETWEEN 0 AND 1) AND
      (variacao_conversao IS NULL OR variacao_conversao BETWEEN 0 AND 1) AND
      (variacao_receita IS NULL OR variacao_receita BETWEEN 0 AND 1) AND
      (taxa_captacao IS NULL OR taxa_captacao BETWEEN 0 AND 1) AND
      (faixa_variacao IS NULL OR faixa_variacao BETWEEN 0 AND 1) AND
      (fracao_cenario_1 IS NULL OR fracao_cenario_1 BETWEEN 0 AND 1) AND
      (nivel_assumido IS NULL OR nivel_assumido BETWEEN 1 AND 8)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_combinations_valores') THEN
    ALTER TABLE "plan_organic_combinations" ADD CONSTRAINT "ck_plan_organic_combinations_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (sel_whatsapp IS NULL OR sel_whatsapp BETWEEN 1 AND 10) AND
      (sel_email IS NULL OR sel_email BETWEEN 1 AND 10) AND
      (sel_instagram IS NULL OR sel_instagram BETWEEN 1 AND 10) AND
      (sel_telegram IS NULL OR sel_telegram BETWEEN 1 AND 10) AND
      (sel_youtube IS NULL OR sel_youtube BETWEEN 1 AND 10) AND
      (sel_area_membros IS NULL OR sel_area_membros BETWEEN 1 AND 10)
    );
  END IF;
END $$;

-- Rollback:
-- DROP TABLE IF EXISTS "plan_organic_combinations";
-- DROP TABLE IF EXISTS "plan_organic_blocks";
