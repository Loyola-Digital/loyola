-- Epic 47 / Story 47.18 — o NN do criativo reinicia por lançamento e por tipo.
--
-- Pedido do Danilo em 2026-09-25: "pg01 tem o ad01, ad02, adv01, adv02; pg02
-- pode ter o ad01, ad02 também". Até aqui o NN era único POR EXPERT, qualquer
-- tipo e qualquer lançamento (47.10, `uq_naming_ads_expert_seq`) — o primeiro
-- `ad` do `pg05` do dg nascia `ad07`.
--
-- O que muda: a unicidade do NN passa a valer no escopo
--   (expert_id, launch_type, launch_seq, creative_type, creative_seq)
-- com `launch_seq` NULL contando como UM valor (`NULLS NOT DISTINCT`, PG 15+;
-- produção é 17.11): dois `adv01` de `perpetuo` (47.16, sem número) do mesmo
-- expert colidem; `ad01` no `pg01` e no `pg02` convivem; `ad01` e `adv01` no
-- mesmo `pg01` convivem.
--
-- Nenhuma linha muda (regra 6: nome publicado não muda) — sem UPDATE. Os 6
-- anúncios de hoje (`adv01`–`adv06` do dg, `perpetuo`, `launch_seq` NULL) têm
-- NN distintos no mesmo escopo: continuam válidos no índice novo.
--
-- Por que o `schema.ts` declara `uniqueIndex(...).on(5 colunas)` SEM a
-- cláusula (PO-01): o drizzle-orm 0.45.1 não tem `nullsNotDistinct()` no
-- índice, e o `unique().nullsNotDistinct()` de constraint faz o drizzle-kit
-- 0.31.9 ver diferença a cada boot (a introspecção grava `false` fixo) — o
-- `drizzle-kit push --force` do CMD derrubaria e recriaria a constraint em toda
-- subida. A introspecção de ÍNDICE não lê `indnullsnotdistinct`, então o push
-- vê este índice como igual ao declarado e não mexe (provado na Story 47.18,
-- Dev Agent Record). Consequência aceita: num banco criado só pelo push, o
-- índice nasce sem a cláusula — ESTA migration é a fonte de verdade, e o
-- serviço (`montarAnuncio`) recusa a colisão fora da corrida.
--
-- Idempotente PELA DEFINIÇÃO, não pelo nome (PO-02): se já existir um índice
-- `uq_naming_ads_escopo_seq` que não seja exatamente o esperado (o push da API
-- nova o cria SEM `NULLS NOT DISTINCT` se ela subir antes desta migration), ele
-- é derrubado e recriado. Rodar duas vezes é seguro. O índice novo é criado
-- ANTES de derrubar o antigo — não há janela sem unicidade.
--
-- ⚠️ ORDEM DE APLICAÇÃO (PO-03):
--   1. Pode ser aplicada antes do merge: o índice novo é mais permissivo que o
--      antigo e a API atual continua recusando pelo serviço.
--   2. MAS um restart da API ANTIGA depois dela re-roda o push com o
--      `schema.ts` antigo: recria `uq_naming_ads_expert_seq` e derruba este
--      índice (não está no schema antigo). Por isso a prova que vale é a de
--      DEPOIS do deploy da API nova (contrato 28 no `/api/health`). Se a prova
--      não bater, re-rodar esta migration — ela corrige.
--   3. Sequência segura: merge → deploy da API nova (confirmar `contract` 28 em
--      `/api/health`) → aplicar esta migration → rodar a prova abaixo.
--
-- Prova (depois do deploy da API nova e desta migration):
--
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'naming_ads' ORDER BY indexname;
--   -- esperado: uq_naming_ads_escopo_seq com
--   --   "CREATE UNIQUE INDEX uq_naming_ads_escopo_seq ON public.naming_ads USING btree
--   --    (expert_id, launch_type, launch_seq, creative_type, creative_seq) NULLS NOT DISTINCT"
--   -- e NENHUM uq_naming_ads_expert_seq.

DO $$
DECLARE
  igual boolean;
BEGIN
  SELECT ix.indisunique
         AND ix.indnullsnotdistinct
         AND ix.indpred IS NULL
         AND ix.indexprs IS NULL
         AND ix.indrelid = 'naming_ads'::regclass
         AND ARRAY(
               SELECT a.attname::text
                 FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
             ORDER BY k.ord
             ) = ARRAY['expert_id', 'launch_type', 'launch_seq', 'creative_type', 'creative_seq']
    INTO igual
    FROM pg_index ix
   WHERE ix.indexrelid = to_regclass('uq_naming_ads_escopo_seq');

  -- NULL = não existe (o CREATE abaixo cria); false = existe com OUTRA definição.
  IF igual IS FALSE THEN
    RAISE NOTICE 'uq_naming_ads_escopo_seq existe sem a definição esperada (provavelmente criado pelo push sem NULLS NOT DISTINCT) — recriando';
    DROP INDEX uq_naming_ads_escopo_seq;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_ads_escopo_seq
  ON naming_ads (expert_id, launch_type, launch_seq, creative_type, creative_seq) NULLS NOT DISTINCT;

DROP INDEX IF EXISTS uq_naming_ads_expert_seq;

-- Rollback (só enquanto nenhum NN se repetir por expert — depois dele, o índice
-- antigo não sobe mais):
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_ads_expert_seq ON naming_ads (expert_id, creative_seq);
-- DROP INDEX IF EXISTS uq_naming_ads_escopo_seq;
