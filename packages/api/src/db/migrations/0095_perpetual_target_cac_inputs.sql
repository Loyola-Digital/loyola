-- Story 29.35 — inputs do CAC alvo (reverse_calculation do LOYOLA-X-CAC-PROTOCOL v1).
--
-- O CAC alvo é o teto de mídia por cliente: quanto se pode pagar por uma venda
-- e ainda fechar a margem desejada. A conta é
--
--   CAC_alvo = ticket
--            − (ticket × margem_desejada)
--            − (ticket × imposto)
--            − (ticket × taxa_plataforma_pct)   ← taxa da plataforma de vendas
--            − (ticket × gateway_pct_var)       ← taxa do gateway de pagamento
--            − cmv
--
-- Dos seis inputs, TRÊS já existem em `perpetual_report_configs` (migration
-- 0087): `imposto_pct`, `taxa_plataforma_pct` (o gateway %) e as demais
-- deduções. O ticket médio é DERIVADO (faturamento bruto ÷ vendas), não campo.
-- Faltavam os três abaixo.
--
-- Story 29.39 / decisão do @po em 2026-08-05: o gateway desta operação NÃO tem
-- parcela fixa por transação — o custo inteiro varia com o faturamento. Por isso
-- a coluna nasce como FRAÇÃO (`gateway_pct_var`) e não em reais.
--
-- Este arquivo era `0092_perpetual_target_cac_inputs.sql` e foi renumerado para
-- `0095` porque o `0092` já pertencia à integração VTurb (PR #469), que chegou
-- pela main e JÁ foi aplicada. Duas migrations com o mesmo prefixo na mesma
-- pasta é ambiguidade que não sobrevive ao primeiro runner automático.
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
  ADD COLUMN IF NOT EXISTS "gateway_pct_var" numeric(6, 5);

COMMENT ON COLUMN "perpetual_report_configs"."margem_desejada_pct" IS
  'Margem desejada sobre o ticket BRUTO, decimal (0.15 = 15%). Precisa embutir equipe, ferramentas e comissao: o CAC alvo nao cobre nenhum dos tres (aviso D7 do protocolo).';

COMMENT ON COLUMN "perpetual_report_configs"."cmv" IS
  'Custo da mercadoria vendida por unidade, em reais. Inclui frete e embalagem. Tipicamente 0 em produto digital.';

COMMENT ON COLUMN "perpetual_report_configs"."gateway_pct_var" IS
  'Taxa do GATEWAY DE PAGAMENTO como fracao do faturamento (0.025 = 2,5%). Custo distinto de taxa_plataforma_pct, que e a taxa da plataforma de vendas: os dois incidem sobre o mesmo ticket e SOMAM. Ficam separados para o memorial do CAC alvo manter rastreavel de onde cada deducao saiu.';

-- Rollback:
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "margem_desejada_pct";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "cmv";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "gateway_pct_var";
