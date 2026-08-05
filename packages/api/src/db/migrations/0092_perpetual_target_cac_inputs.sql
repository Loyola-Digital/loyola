-- Story 29.35 — inputs do CAC alvo (reverse_calculation do LOYOLA-X-CAC-PROTOCOL v1).
--
-- O CAC alvo é o teto de mídia por cliente: quanto se pode pagar por uma venda
-- e ainda fechar a margem desejada. A conta é
--
--   CAC_alvo = ticket
--            − (ticket × margem_desejada)
--            − (ticket × imposto)
--            − (ticket × gateway% + gateway_fixo)
--            − cmv
--
-- Dos seis inputs, TRÊS já existem em `perpetual_report_configs` (migration
-- 0087): `imposto_pct`, `taxa_plataforma_pct` (o gateway %) e as demais
-- deduções. O ticket médio é DERIVADO (faturamento bruto ÷ vendas), não campo.
-- Faltavam os três abaixo.
--
-- O que NÃO está aqui, de propósito:
--   reembolso/chargeback → o protocolo (M-DECK) os provisiona como % do ticket,
--   mas o Loyola X já os remove ex-post do faturamento (`isRefundBucket`, em
--   sales-status.ts). Provisionar de novo seria deduzir a mesma perda duas
--   vezes — é o guarda RC-01 do protocolo. Ficam fora por decisão, não por
--   esquecimento.
--
-- Additive + idempotente (prod não roda drizzle migrate).

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "margem_desejada_pct" numeric(6, 4);

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "cmv" numeric(12, 2);

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "gateway_fixo" numeric(12, 2);

COMMENT ON COLUMN "perpetual_report_configs"."margem_desejada_pct" IS
  'Margem desejada sobre o ticket BRUTO, decimal (0.15 = 15%). Precisa embutir equipe, ferramentas e comissao: o CAC alvo nao cobre nenhum dos tres (aviso D7 do protocolo).';

COMMENT ON COLUMN "perpetual_report_configs"."cmv" IS
  'Custo da mercadoria vendida por unidade, em reais. Inclui frete e embalagem. Tipicamente 0 em produto digital.';

COMMENT ON COLUMN "perpetual_report_configs"."gateway_fixo" IS
  'Parcela FIXA da taxa do gateway, em reais por transacao. O percentual vive em taxa_plataforma_pct.';

-- Rollback:
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "margem_desejada_pct";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "cmv";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "gateway_fixo";
