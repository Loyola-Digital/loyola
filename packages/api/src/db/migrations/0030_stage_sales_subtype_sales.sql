-- Story 19.7: adiciona 'sales' ao CHECK constraint de stage_sales_spreadsheets.subtype
--
-- Setup original (migration 0016) restringia subtype a ('capture', 'main_product').
-- Story 19.7 introduz o subtype 'sales' para etapas do tipo "sales" (1 planilha de
-- vendas por stage, isolada por UNIQUE (stage_id, subtype)). Sem esta migration,
-- INSERTs com subtype='sales' violam a constraint stage_sales_spreadsheets_subtype_check.

ALTER TABLE stage_sales_spreadsheets
  DROP CONSTRAINT IF EXISTS stage_sales_spreadsheets_subtype_check;

ALTER TABLE stage_sales_spreadsheets
  ADD CONSTRAINT stage_sales_spreadsheets_subtype_check
  CHECK (subtype IN ('capture', 'main_product', 'sales'));
