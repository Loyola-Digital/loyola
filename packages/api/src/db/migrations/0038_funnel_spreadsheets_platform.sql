-- Migration 0038 — Epic 29 Story 29.7
-- Adiciona coluna platform a funnel_spreadsheets pra calculo de margem
-- por plataforma (Kiwify/Hotmart fees descontados da Receita Bruta).

ALTER TABLE "funnel_spreadsheets"
  ADD COLUMN IF NOT EXISTS "platform" varchar(20);
