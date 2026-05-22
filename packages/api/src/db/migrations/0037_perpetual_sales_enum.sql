-- Migration 0037 — Epic 29 Story 29.1
-- Adiciona 'perpetual_sales' ao enum funnel_spreadsheet_type
-- IMPORTANTE: ALTER TYPE ... ADD VALUE deve rodar FORA de transação no Postgres.
-- O script apply-migration-0037 roda este SQL com autocommit.

ALTER TYPE "funnel_spreadsheet_type" ADD VALUE IF NOT EXISTS 'perpetual_sales';
