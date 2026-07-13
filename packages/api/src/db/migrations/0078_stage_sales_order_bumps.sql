-- Order Bumps na etapa Captação Paga (Story 18.51a): marca quais productName
-- da planilha de vendas são order bumps. Produtos não listados = produto da
-- captação (ingresso). Base das métricas únicas vs totais. Aditiva e idempotente.

ALTER TABLE "stage_sales_spreadsheets" ADD COLUMN IF NOT EXISTS "order_bump_products" jsonb NOT NULL DEFAULT '[]'::jsonb;
