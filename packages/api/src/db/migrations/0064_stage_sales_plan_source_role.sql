-- Story 19.15 — papel da planilha conectada à etapa de Evento.
-- "participants" = lista mestre (todo mundo); "survey" = respostas (faturamento
-- por email). O Mapa e o Plano usam a mestre; o faturamento vem das respostas.
-- Aditiva e idempotente.

ALTER TABLE "stage_sales_plan_sources"
  ADD COLUMN IF NOT EXISTS "role" varchar(20) DEFAULT 'participants' NOT NULL;
