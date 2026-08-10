-- Story 29.49 — classificação de produtos da planilha do Perpétuo.
--
-- `productName` → "principal" | "order_bump" | "upsell". Produto AUSENTE do
-- mapa é tratado como principal, que é o default da Captação Paga (o que não
-- se marca é o produto de entrada) e o que mantém planilha já conectada com o
-- comportamento de hoje.
--
-- A tabela é compartilhada por todos os tipos de planilha; só `perpetual_sales`
-- lê esta coluna. O default `{}` deixa os demais tipos inalterados.
ALTER TABLE "funnel_spreadsheets"
  ADD COLUMN IF NOT EXISTS "product_types" jsonb DEFAULT '{}'::jsonb NOT NULL;
