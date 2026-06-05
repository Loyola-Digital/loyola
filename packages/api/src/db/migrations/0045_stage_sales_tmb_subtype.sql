-- Feature TMB: adiciona subtype 'tmb' como slot FIXO de planilha de vendas
--
-- A etapa Vendas tinha 3 subtypes: capture, main_product (1 planilha cada, via
-- partial UNIQUE) e sales (N planilhas — "Outras planilhas"). Esta migration
-- adiciona 'tmb' como um 4º slot FIXO (1 planilha por stage), igual a
-- capture/main_product. O cliente conecta uma planilha extra (gateway TMB),
-- cujas vendas são somadas no agregado e identificadas com badge "TMB" na
-- tabela unificada (rota /all-sales).

ALTER TABLE stage_sales_spreadsheets
  DROP CONSTRAINT IF EXISTS stage_sales_spreadsheets_subtype_check;

ALTER TABLE stage_sales_spreadsheets
  ADD CONSTRAINT stage_sales_spreadsheets_subtype_check
  CHECK (subtype IN ('capture', 'main_product', 'sales', 'tmb'));

-- Partial UNIQUE: 'tmb' é 1-por-stage (slot fixo). Recria o índice da migration
-- 0031 incluindo 'tmb' junto de capture/main_product. 'sales' continua de fora
-- (N planilhas permitidas).
DROP INDEX IF EXISTS uq_stage_sales_spreadsheets_capture_main_product;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_sales_spreadsheets_single_slot
  ON stage_sales_spreadsheets (stage_id, subtype)
  WHERE subtype IN ('capture', 'main_product', 'tmb');
