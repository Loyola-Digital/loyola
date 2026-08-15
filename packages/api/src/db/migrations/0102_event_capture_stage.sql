-- Captação de Evento: novo stage_type "event_capture".
--
-- A coluna era varchar(10) — "debriefing" ocupava o limite exato e
-- "event_capture" (13) não cabia. Ampliar varchar é não-destrutivo: nenhum valor
-- existente muda e a tabela é pequena, então o ALTER é instantâneo.
--
-- Idempotente: rodar de novo com a coluna já em 20 não faz nada.
ALTER TABLE "funnel_stages"
  ALTER COLUMN "stage_type" TYPE varchar(20);

-- Forma de pagamento do ingresso (PIX, Cartão, Dinheiro…). Preenchida pela
-- leitura do comprovante ou à mão; nula nas vendas antigas, que não tinham
-- o campo.
ALTER TABLE "manual_sales"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(40);
