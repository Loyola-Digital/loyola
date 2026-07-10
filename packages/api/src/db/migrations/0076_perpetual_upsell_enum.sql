-- Migration 0076 — Epic 29 Story 29.22
-- Adiciona 'perpetual_upsell' ao enum funnel_spreadsheet_type
-- (planilha de upsell high ticket conectada ao funil perpétuo).
-- IMPORTANTE: ALTER TYPE ... ADD VALUE deve rodar FORA de transação no Postgres.

ALTER TYPE "funnel_spreadsheet_type" ADD VALUE IF NOT EXISTS 'perpetual_upsell';
