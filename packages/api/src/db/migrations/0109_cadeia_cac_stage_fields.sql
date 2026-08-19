-- Story 44.9 (AC4) — os dois campos que o benchmark de Conv. LP da spec §5 exige.
--
-- `lp_tem_vsl` é por ETAPA, não por LP (decisão @po 2026-08-19): o benchmark
-- que ele libera (4% / 7,5%) é comparado contra o `convLP` DA ETAPA, um número
-- agregado. A spec não tem Conv. LP por LP, então um booleano por LP exigiria
-- inventar uma regra de agregação que ela não define.
--
-- Ambos NULL por padrão, e NULL não é `false`:
--   lp_tem_vsl NULL          = ninguém respondeu ainda → sem benchmark, com motivo
--   lp_tem_vsl false         = respondido: não tem VSL → sem benchmark, também com motivo
--   ticket_medio_manual NULL = sem ticket → não dá para escolher entre 4% e 7,5%
--
-- A distinção importa porque a regra 7.4 manda declarar ausência em vez de
-- assumir um padrão.

ALTER TABLE funnel_stages
  ADD COLUMN IF NOT EXISTS lp_tem_vsl boolean,
  ADD COLUMN IF NOT EXISTS ticket_medio_manual numeric(12, 2);

COMMENT ON COLUMN funnel_stages.lp_tem_vsl IS
  'Story 44.9: a LP da etapa tem VSL? Libera o benchmark de Conv. LP (spec §5, 4%/7,5%). NULL = não respondido, diferente de false.';

COMMENT ON COLUMN funnel_stages.ticket_medio_manual IS
  'Story 44.9: ticket médio manual em reais. Decide 4% (>R$147) ou 7,5% (<R$147). Manual APENAS enquanto não houver venda real — com venda, usar faturamento ÷ nº de vendas do Loyola.';
