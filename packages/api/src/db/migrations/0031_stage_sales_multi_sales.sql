-- Story 19.7: permitir múltiplas planilhas em etapa Vendas (subtype='sales')
--
-- Original: UNIQUE (stage_id, subtype) — restringia 1 planilha por (stage, subtype).
-- Pra etapas tipo 'sales', o usuário precisa conectar N planilhas (várias fontes
-- de venda diferentes) num mesmo stage. Mas pra capture/main_product (etapas
-- pagas) ainda faz sentido manter 1 por subtype.
--
-- Solução: drop UNIQUE total, criar partial UNIQUE só pra capture/main_product.

ALTER TABLE stage_sales_spreadsheets
  DROP CONSTRAINT IF EXISTS uq_stage_sales_spreadsheets_stage_subtype;

ALTER TABLE stage_sales_spreadsheets
  DROP CONSTRAINT IF EXISTS stage_sales_spreadsheets_stage_id_subtype_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_sales_spreadsheets_capture_main_product
  ON stage_sales_spreadsheets (stage_id, subtype)
  WHERE subtype IN ('capture', 'main_product');
