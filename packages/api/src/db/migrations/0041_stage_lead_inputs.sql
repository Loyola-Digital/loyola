-- Migration 0041 — Epic 18 Story 18.27
-- Adicionar campos de projeção/meta por etapa de funil
-- Permite que cada etapa tenha sua própria Data Final e Meta de Leads

ALTER TABLE "funnel_stages"
ADD COLUMN IF NOT EXISTS "projection_end_date" DATE,
ADD COLUMN IF NOT EXISTS "lead_goal" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_funnel_stages_projection"
ON "funnel_stages" ("projection_end_date");
