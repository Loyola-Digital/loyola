-- Migration 0039 — Persistir Meta Total + Data Final do gráfico
-- "Leads: Reais vs Projeção vs Meta" (Story 18.19). Antes vivia em
-- localStorage por user/device — agora compartilhado entre time.

ALTER TABLE "funnels"
  ADD COLUMN IF NOT EXISTS "leads_goal_meta" integer,
  ADD COLUMN IF NOT EXISTS "leads_goal_data_final" date;
