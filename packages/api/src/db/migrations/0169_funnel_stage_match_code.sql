-- O código de match da ETAPA — um nível abaixo do que o funil já tinha.
--
-- O funil casa campanhas por `funnels.match_code` (ou, sem ele, o nome inteiro)
-- combinado com um SUFIXO DE FASE adivinhado do nome da etapa
-- (`resolveStagePhaseSuffix`: leads / vendas-captacao / vendas-principal). Essa
-- heurística devolve `null` — e aí nada casa — em funil perpétuo, em etapa
-- `cpl` e `event`, e em qualquer nome que não bata com as regex dela.
--
-- No perpétuo isso é estrutural: a regra dos dois primeiros segmentos não
-- distingue `fz-a1` de `fz-a2`, então as duas etapas disputariam as mesmas
-- campanhas. Preenchido, este campo é a chave COMPLETA da etapa e dispensa o
-- sufixo: a campanha `fz-a1-2026` cai na etapa `fz-a1` e em nenhuma outra.
--
-- Vazio (o default) = comportamento de hoje, intacto.

ALTER TABLE "funnel_stages"
  ADD COLUMN IF NOT EXISTS "match_code" varchar(120);

-- Rollback:
-- ALTER TABLE "funnel_stages" DROP COLUMN IF EXISTS "match_code";
