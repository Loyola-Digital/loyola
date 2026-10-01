-- Story 49.1 — Config do gerador de debriefing + gates (Epic 49).
--
-- 1 linha por ETAPA DE DEBRIEFING (`funnel_stages.stage_type = 'debriefing'`):
-- é a etapa onde mora o botão "Gerar debriefing" (49.6) e à qual o documento
-- gerado se vincula (`debriefings.stage_id`). Funil e projeto derivam dela.
--
-- Tabela PRÓPRIA, não colunas em `launch_report_configs`: aquela é a config do
-- Resumão (41.1) e o gate dela (`assertReportScope`) não pode mudar. Tabela
-- separada elimina por construção o risco de regressão no Resumão (R3 da story).
--
-- Guarda as premissas que a skill `loyola-debriefing` exige ANTES de calcular
-- (gate `datas-chave` da Fase 0 e `perguntas-da-pesquisa` da Fase 8) e o flag
-- `validado`. Nulo = "sem resposta" — NUNCA um default de expert: o gate lista
-- o campo como faltante (422 CONFIG_INCOMPLETA) em vez de presumir.
--
--   inicio_captacao / abertura_carrinho / fim_carrinho  → datas-chave (YYYY-MM-DD)
--   reabertura / downsell (jsonb) → {"houve": false} | {"houve": true, "abertura", "fim"}
--   lancamento_comparacao_funnel_id → funil do MESMO projeto (opcional). SEM FK
--     de propósito: um ON DELETE SET NULL apagaria a premissa sem deixar rastro
--     (a config seguiria "validada" sem a comparação). O carregador confere se
--     o funil ainda é do projeto e, se não for, bloqueia (CONFIG_INCOMPLETA).
--   etapas (jsonb) → [{"stageId", "papel"}], papel ∈ LAUNCH_REPORT_ETAPAS + 'reabertura'
--   perguntas_confirmadas (jsonb) → {stageId: {"faixa": chave|null, campo?: chave}}
--   closer_mediums (jsonb) / closer_por_seller_name / dimensao_de_criativo → config
--     do classificador (49.2) e do criativo (49.4); lista vazia é resposta válida
--
-- Funil perpétuo: a linha existe só para ancorar a etapa e guardar `validado`
-- (49.1 AC11); nenhuma coluna de lançamento é exigida.
--
-- `validado` nasce false; só o time marca true (POST …/debriefing/config/validate)
-- e o PUT volta para false quando qualquer premissa muda.
--
-- ⚠️ APLICAÇÃO: o deploy (merge na main) NÃO aplica migration — o `drizzle-kit
-- push` do boot deixou de criar tabela nova em setembro/2026. Aplicar à mão em
-- produção ANTES de liberar as rotas e provar pelo information_schema:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'debriefing_configs'
--   ORDER BY ordinal_position;                                  -- 18 colunas
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'debriefing_configs';                     -- pkey + stage_uniq
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'debriefing_configs'::regclass;            -- pkey, 2 FKs, 1 CHECK
--
-- Aditiva e idempotente (IF NOT EXISTS): não toca tabela existente; a API
-- antiga ignora a tabela.
--
-- Rollback (só depois de reverter a API — as rotas da 49.1 leem esta tabela):
--   DROP TABLE IF EXISTS "debriefing_configs";

CREATE TABLE IF NOT EXISTS "debriefing_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "inicio_captacao" date,
  "abertura_carrinho" date,
  "fim_carrinho" date,
  "reabertura" jsonb,
  "downsell" jsonb,
  "lancamento_comparacao_funnel_id" uuid,
  "etapas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "perguntas_confirmadas" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "closer_mediums" jsonb,
  "closer_por_seller_name" boolean,
  "dimensao_de_criativo" varchar(20),
  "validado" boolean DEFAULT false NOT NULL,
  "validado_em" timestamp with time zone,
  "validado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_debriefing_configs_dimensao_de_criativo" CHECK (
    "dimensao_de_criativo" IS NULL
    OR "dimensao_de_criativo" IN ('ia-humano', 'video-estatico', 'nenhuma')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "debriefing_configs_stage_uniq"
  ON "debriefing_configs" ("stage_id");
