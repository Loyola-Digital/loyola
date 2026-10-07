-- Story 49.12 — Debriefing em andamento: gerar com a captação ainda aberta
-- (Epic 49, rodada 8 do dono: R8-1 a R8-4).
--
-- Três mudanças, todas ADITIVAS (nenhuma coluna existente muda):
--
-- 1. `debriefing_configs.situacao_do_lancamento` — "O lançamento terminou?"
--    (AC1): 'encerrado' | 'em-andamento'. DEFAULT 'encerrado': toda config já
--    gravada passou pelo PUT da 49.1, que exigia as três datas-chave — ela
--    descreve um lançamento encerrado e continua igual (decisão de escopo da
--    story, aceita pelo @po).
-- 2. `debriefing_configs.ainda_nao_aconteceu` — as fases respondidas "ainda não
--    aconteceu" no modo em andamento (AC2): subconjunto de
--    ["aberturaCarrinho","fimCarrinho","reabertura","downsell"]. A coluna da
--    data (ou o jsonb da reabertura/downsell) fica nula e a fase entra aqui —
--    "ainda não aconteceu" ≠ "não houve" ({"houve": false}). DEFAULT '[]'.
-- 3. `debriefing_payloads.parcial` + índice único PARCIAL por etapa (AC10): no
--    máximo UMA parcial por etapa Debriefing (`stage_id_origem`, a etapa que o
--    payload descreve). A próxima parcial e o relatório final ATUALIZAM essa
--    linha (o mesmo debriefing, comentários preservados); um final nunca é
--    sobrescrito. DEFAULT false: todo payload salvo até aqui é um final.
--
-- Número 0168: a última na `main` é a 0167 (#988, `33e34273`). Conferido em
-- 2026-10-07 na `main` (4920adfb), nas 139 branches remotas e nas PRs abertas:
-- nenhuma usa 0168+.
--
-- ⚠️ APLICAÇÃO: o deploy (merge na main) NÃO aplica migration, e o deploy é
-- automático a partir da main. Por isso a 0168 é aplicada à mão em produção e
-- provada pelo information_schema ANTES do merge — nunca "junto com o merge".
-- Sem as colunas, o código novo dá 500 em:
--   • o VIEWER de QUALQUER debriefing, inclusive os enviados por upload (Epic 37):
--     `GET /api/debriefings/:id` seleciona `debriefing_payloads.parcial` num
--     leftJoin que roda sempre (`routes/debriefings.ts`);
--   • o GET/PUT da config do debriefing e o gate (`select()` de `debriefing_configs`);
--   • o "Gerar debriefing" (o INSERT/UPDATE leva `parcial`).
-- A 0168 é retrocompatível com o código da main (INSERT sem as colunas novas pega
-- os defaults; as leituras da main nomeiam as colunas), então aplicá-la antes é seguro.
-- Prova pelo information_schema:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'debriefing_configs'
--     AND column_name IN ('situacao_do_lancamento', 'ainda_nao_aconteceu');   -- 2 linhas, NOT NULL
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'debriefing_payloads' AND column_name = 'parcial';     -- 1 linha, NOT NULL, false
--
--   SELECT conname FROM pg_constraint
--   WHERE conname = 'ck_debriefing_configs_situacao_do_lancamento';           -- 1 linha
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE indexname = 'uq_debriefing_payloads_parcial_por_etapa';             -- UNIQUE … WHERE parcial
--
--   SELECT situacao_do_lancamento, count(*) FROM debriefing_configs GROUP BY 1; -- só 'encerrado' logo depois
--   SELECT count(*) FROM debriefing_payloads WHERE parcial;                     -- 0 logo depois
--
-- Idempotente (IF NOT EXISTS / guarda no DO).
--
-- ROLLBACK (só DEPOIS de reverter a API — a API da 49.12 lê e grava as três colunas):
--   DROP INDEX IF EXISTS "uq_debriefing_payloads_parcial_por_etapa";
--   ALTER TABLE "debriefing_payloads" DROP COLUMN IF EXISTS "parcial";
--   ALTER TABLE "debriefing_configs" DROP CONSTRAINT IF EXISTS "ck_debriefing_configs_situacao_do_lancamento";
--   ALTER TABLE "debriefing_configs" DROP COLUMN IF EXISTS "ainda_nao_aconteceu";
--   ALTER TABLE "debriefing_configs" DROP COLUMN IF EXISTS "situacao_do_lancamento";
-- Antes do rollback, uma config "em andamento" com o carrinho "ainda não
-- aconteceu" tem as datas nulas: a API da 49.11 a lê como CONFIG_INCOMPLETA
-- (bloqueia, não inventa datas). Uma parcial salva vira um debriefing comum.

ALTER TABLE "debriefing_configs"
  ADD COLUMN IF NOT EXISTS "situacao_do_lancamento" text DEFAULT 'encerrado' NOT NULL;

ALTER TABLE "debriefing_configs"
  ADD COLUMN IF NOT EXISTS "ainda_nao_aconteceu" jsonb DEFAULT '[]'::jsonb NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_debriefing_configs_situacao_do_lancamento'
  ) THEN
    ALTER TABLE "debriefing_configs"
      ADD CONSTRAINT "ck_debriefing_configs_situacao_do_lancamento"
      CHECK ("situacao_do_lancamento" IN ('encerrado', 'em-andamento'));
  END IF;
END $$;

ALTER TABLE "debriefing_payloads"
  ADD COLUMN IF NOT EXISTS "parcial" boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_debriefing_payloads_parcial_por_etapa"
  ON "debriefing_payloads" ("stage_id_origem")
  WHERE "parcial";
