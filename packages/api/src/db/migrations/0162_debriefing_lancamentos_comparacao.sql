-- Story 49.11 — Série histórica = LISTA de lançamentos de comparação (Epic 49)
-- e a pesquisa de captação que vence o desempate sem data (R6-7).
--
-- ADITIVA: só acrescenta duas colunas em `debriefing_configs` (tabela da 49.1,
-- migration 0161). Nenhuma coluna sai, nenhuma linha é alterada (sem UPDATE) —
-- uma migração de dados sobre premissa validada é a mudança invisível que a
-- 49.1 quer evitar.
--
--   lancamentos_comparacao (jsonb, '[]') → array ORDENADO de ids de funil do
--     MESMO projeto; o primeiro é a comparação principal (decisão do dono R6-5).
--     SEM FK, pela mesma razão da coluna antiga (49.1 REL-002): um SET NULL ou
--     uma cascata apagaria a premissa sem rastro. O carregador confere item a
--     item se o funil ainda é do projeto (R4-14, aviso por item).
--   pesquisa_de_captacao_por_etapa (jsonb, '{}') → { stageId: funnel_surveys.id }:
--     em etapa com 2+ pesquisas, a pesquisa cuja resposta vence o desempate
--     sem data (decisão do dono R6-7). Sem marca = posição + lacuna declarada.
--
-- A coluna `lancamento_comparacao_funnel_id` (0161) FICA: é o que a API antiga
-- lê e escreve durante o deploy/rollback. Leitura (services/debriefing-config.ts,
-- `valoresDaLinha`): a lista vale quando o 1º item é igual à coluna antiga; se
-- divergirem (API antiga escreveu por último), vale a coluna antiga. Linha de
-- antes desta migration (lista '[]', antiga preenchida) = [antiga] — premissa
-- igual, `validado` não cai. O PUT novo grava as duas colunas coerentes.
--
-- Número 0162: conferido em 2026-10-02 contra a `main` (b419a7f3), as 135
-- branches remotas e as PRs abertas. Aplicar sempre pelo NOME COMPLETO.
--
-- ⚠️ APLICAÇÃO: o deploy (merge na main) NÃO aplica migration. Aplicar à mão em
-- produção junto com o merge (como a 0161, R4-5) — sem as colunas, o GET e o
-- PUT da config do debriefing dão 500 — e provar pelo information_schema:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'debriefing_configs'
--   ORDER BY ordinal_position;          -- 21 colunas (as 19 da 0161 + as 2 novas)
--
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'debriefing_configs'::regclass
--     AND contype IN ('p', 'f', 'c');   -- inalterado: pkey, 2 FKs, 1 CHECK
--   (sem o filtro, o PG 18 lista também os NOT NULL — contype 'n')
--
--   SELECT count(*) FROM debriefing_configs
--   WHERE lancamentos_comparacao <> '[]'::jsonb
--      OR pesquisa_de_captacao_por_etapa <> '{}'::jsonb;  -- 0 logo depois de aplicar
--
-- Idempotente (IF NOT EXISTS).
--
-- Rollback (só DEPOIS de reverter a API — a API da 49.11 lê as duas colunas):
--   ALTER TABLE "debriefing_configs" DROP COLUMN IF EXISTS "pesquisa_de_captacao_por_etapa";
--   ALTER TABLE "debriefing_configs" DROP COLUMN IF EXISTS "lancamentos_comparacao";
-- A coluna antiga continua coerente com o 1º item (o PUT novo grava as duas),
-- então a API da 49.1 segue lendo a comparação principal depois do rollback.

ALTER TABLE "debriefing_configs"
  ADD COLUMN IF NOT EXISTS "lancamentos_comparacao" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "debriefing_configs"
  ADD COLUMN IF NOT EXISTS "pesquisa_de_captacao_por_etapa" jsonb DEFAULT '{}'::jsonb NOT NULL;
