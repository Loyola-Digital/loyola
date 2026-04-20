-- Story 19.5: Tabela de planilhas de vendas por etapa paga
CREATE TABLE stage_sales_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  subtype VARCHAR(20) NOT NULL CHECK (subtype IN ('capture', 'main_product')),
  spreadsheet_id VARCHAR(255) NOT NULL,
  spreadsheet_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, subtype)
);

CREATE INDEX idx_stage_sales_spreadsheets_stage ON stage_sales_spreadsheets(stage_id);
