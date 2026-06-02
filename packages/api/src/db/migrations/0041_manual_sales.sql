-- Migration 0041 — Story 19.9
-- Vendas manuais (PIX direto) lancadas dentro do app, separadas das vendas que
-- vem da planilha Google Sheets. Cada venda guarda snapshot do nome do vendedor
-- pra historico nao quebrar se o usuario sair do projeto.

CREATE TABLE IF NOT EXISTS "manual_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "customer_name" varchar(255) NOT NULL,
  "customer_email" varchar(255),
  "customer_phone" varchar(50),
  "value" numeric(12, 2) NOT NULL,
  "seller_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "seller_name" varchar(255) NOT NULL,
  "sale_date" timestamptz NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "manual_sales_value_positive" CHECK ("value" > 0)
);

CREATE INDEX IF NOT EXISTS "idx_manual_sales_stage_date"
  ON "manual_sales" ("stage_id", "sale_date" DESC);
