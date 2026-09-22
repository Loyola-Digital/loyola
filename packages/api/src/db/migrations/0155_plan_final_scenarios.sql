-- Story 48.5 — Resumo Final do Painel de Planejamento (Epic 48).
--
-- Uma tabela-filha de `plan_simulators`: o rótulo de cada um dos cinco
-- cenários da aba 4 (META PISO / META BOA / META SUPER ou vazio) — a única
-- entrada manual da aba (DV-017 = A: anotação, sem regra). Todo o resto é
-- consolidação das abas 1–3, recalculada na tela.
--
-- A tabela e o índice único também estão em `schema.ts` (o boot roda
-- `drizzle-kit push`); este arquivo existe para (a) aplicação manual quando o
-- push não roda e (b) os CHECKs, que o push não expressa. Conferir no
-- information_schema antes do merge (DoD da story; lição de 10/09 e 16/09).
--
-- Additive + idempotente (prod não roda drizzle migrate).

CREATE TABLE IF NOT EXISTS "plan_final_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "simulator_id" uuid NOT NULL REFERENCES "plan_simulators"("id") ON DELETE CASCADE,
  "indice" integer NOT NULL,
  "rotulo" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_final_scenarios_simulator_indice"
  ON "plan_final_scenarios" ("simulator_id", "indice");

-- CHECKs (cinto; a rota valida com zod e responde 400 antes de chegar aqui).
-- Índice 1..5; rótulo na lista literal da planilha (validação de dados de
-- G6, I6, K6, M6, O6) ou vazio.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_final_scenarios_valores') THEN
    ALTER TABLE "plan_final_scenarios" ADD CONSTRAINT "ck_plan_final_scenarios_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (rotulo IS NULL OR rotulo IN ('META PISO', 'META BOA', 'META SUPER'))
    );
  END IF;
END $$;

-- Rollback:
-- DROP TABLE IF EXISTS "plan_final_scenarios";
