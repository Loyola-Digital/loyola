-- Migration 0044 — Story 19.9 ext
-- Adiciona product (texto livre do produto vendido) e invoice_status
-- (pendente/emitida) na manual_sales pra refletir realidade do PIX direto.

ALTER TABLE "manual_sales"
  ADD COLUMN IF NOT EXISTS "product" varchar(255),
  ADD COLUMN IF NOT EXISTS "invoice_status" varchar(20);

ALTER TABLE "manual_sales"
  DROP CONSTRAINT IF EXISTS "manual_sales_invoice_status_check";

ALTER TABLE "manual_sales"
  ADD CONSTRAINT "manual_sales_invoice_status_check"
  CHECK ("invoice_status" IS NULL OR "invoice_status" IN ('emitida', 'pendente'));
