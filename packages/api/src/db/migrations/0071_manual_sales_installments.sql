-- Parcelamento combinado (Evento Presencial): calendário de pagamento.
-- Na venda registra-se o acordo de parcelamento (valor mensal combinado,
-- data da 1ª parcela e nº de parcelas); a aba Calendário projeta as datas.
-- Colunas nullable (venda à vista fica tudo null); aditiva e idempotente.

ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "installment_count" integer;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "installment_amount" numeric(12,2);--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "first_installment_date" date;
