-- Story 19.15 — Dados fiscais da venda de Evento Presencial: CPF, endereço e
-- valor da nota fiscal (distinto do valor da venda). Colunas nullable pra não
-- quebrar linhas existentes — a obrigatoriedade é aplicada na camada de app
-- apenas para a etapa de Evento. Aditiva e idempotente.

ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "customer_cpf" varchar(11);--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "customer_address" text;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "valor_nota" numeric(12, 2);
