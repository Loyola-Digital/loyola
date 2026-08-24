-- Preço unitário do ingresso, para descobrir quantos ingressos cada venda tem.
--
-- A Kiwify não expõe quantidade: uma compra de 3 ingressos chega como UMA venda
-- (procurado `quantity`, `qty`, `items`, `tickets`, `seats` nos campos, em
-- /sales/{id} e nos endpoints /items e /orders — 404 nos dois). O que ela dá é
-- `payment.product_base_price`, que JÁ embute a quantidade: na conta do Netão,
-- uma venda de R$ 3.291 é 1097 × 3.
--
-- Sem o unitário aqui não há como dividir, e toda venda vale 1 — que é o
-- comportamento de hoje, e continua sendo o padrão.
ALTER TABLE kiwify_stage_configs
  ADD COLUMN IF NOT EXISTS ticket_price NUMERIC;
