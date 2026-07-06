-- Reembolso de venda manual (Evento Presencial): cliente deu sinal e desistiu —
-- a venda é marcada como reembolsada (com motivo e autor) em vez de apagada,
-- preservando o histórico. Vendas reembolsadas saem dos totais (faturado/coletado)
-- na camada de app. Colunas nullable; aditiva e idempotente.

ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "refunded_at" timestamptz;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "refund_reason" text;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "refunded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
