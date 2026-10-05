-- Story 49.6 — payload do Debriefing gerado, persistido junto do HTML (Epic 49).
--
-- Tabela IRMÃ 1:1 de `debriefings` (decisão de modelagem desta story, @dev com
-- [AUTO-DECISION] — a story deixava "coluna jsonb × tabela irmã" para dentro
-- dela). Por que irmã e não coluna:
--   • o PUT do viewer (`routes/debriefings.ts`, edição inline/renomear/re-vincular)
--     não toca esta tabela POR CONSTRUÇÃO — o payload continua o gerado (AC2);
--   • as listas (`GET /api/debriefings`) não carregam o payload (centenas de KB)
--     — nenhum SELECT existente muda;
--   • debriefing de upload manual simplesmente não tem linha aqui (AC2).
-- `ON DELETE CASCADE`: excluir o debriefing remove o payload junto (AC2).
-- `stage_id_origem` SEM FK: é a etapa que o payload descreve (= payload.config.stageId).
--   Mover o documento de etapa (PUT stageId) não muda o que o payload descreve;
--   apagar a etapa não pode apagar nem anular o rastro (a FK de `debriefings`
--   já é SET NULL).
--
-- Colunas (AC2): discriminador `tipo` ("lancamento" aqui; a 49.10 grava
-- "perpetuo"), `versao` do schema do payload (49.5), o `payload` completo
-- (DebriefingPayload — sem PII de comprador, decisão 11), a `comparacao` usada
-- no Δ (payload do lançamento de comparação principal, ou NULL = edição única),
-- os `alertas` das guardas (49.5) e a procedência do imposto (stage/project/default).
--
-- Número 0165 (renumerada de 0164 em 05/10/2026: a #979, lead-capi, levou a
-- 0164 na main). A 0163 fica para a Story 41.12 parte B, que a cita no doc
-- (`docs/stories/41.12…md`, "Fatia B, R6-8: 0163_*.sql"). Conferido em
-- 2026-10-02: `main` 7fd149f5 vai até a 0162; nenhuma branch remota nem PR
-- aberta tem 0163+. Aplicar sempre pelo NOME COMPLETO.
--
-- ⚠️ APLICAÇÃO: o deploy (merge na main) NÃO aplica migration. Aplicar à mão em
-- produção junto com o merge — sem a tabela, o "Gerar debriefing" dá 500 — e
-- provar pelo information_schema:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'debriefing_payloads'
--   ORDER BY ordinal_position;          -- 9 colunas
--
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'debriefing_payloads'::regclass
--     AND contype IN ('p', 'f', 'c');   -- pkey, 1 FK (cascade), 2 CHECK
--
-- ROLLBACK (só depois de reverter a API — a rota de geração grava aqui):
--   DROP TABLE IF EXISTS debriefing_payloads;
-- Nenhuma outra tabela é alterada; os debriefings gerados continuam com o HTML.

CREATE TABLE IF NOT EXISTS "debriefing_payloads" (
  "debriefing_id" uuid PRIMARY KEY REFERENCES "debriefings"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL,
  "versao" integer NOT NULL,
  "stage_id_origem" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "comparacao" jsonb,
  "alertas" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "imposto_origem" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "debriefing_payloads_tipo_check" CHECK ("tipo" IN ('lancamento', 'perpetuo')),
  CONSTRAINT "debriefing_payloads_imposto_origem_check" CHECK ("imposto_origem" IN ('stage', 'project', 'default'))
);
