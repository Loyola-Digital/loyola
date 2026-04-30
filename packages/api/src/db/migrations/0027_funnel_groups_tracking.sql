-- Migration: funnel groups tracking via Google Sheets
-- Motivo: ingerir snapshots diários de grupos de WhatsApp/Telegram (entradas/saídas/participantes)
-- a partir de planilha Google Sheets para exibir no dashboard do funil.

-- 1. Configuração do link da planilha (1 por funil)
CREATE TABLE IF NOT EXISTS funnel_groups_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL UNIQUE REFERENCES funnels(id) ON DELETE CASCADE,
  spreadsheet_id VARCHAR(255) NOT NULL,
  spreadsheet_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnel_groups_spreadsheets_funnel
  ON funnel_groups_spreadsheets(funnel_id);

-- 2. Snapshots ingeridos (uma linha por linha da planilha)
CREATE TABLE IF NOT EXISTS funnel_group_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  campaign_id VARCHAR(255) NOT NULL,
  campaign_name VARCHAR(500) NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  clicks_total INTEGER NOT NULL DEFAULT 0,
  group_full INTEGER NOT NULL DEFAULT 0,
  group_open INTEGER NOT NULL DEFAULT 0,
  group_total INTEGER NOT NULL DEFAULT 0,
  input_amount INTEGER NOT NULL DEFAULT 0,
  output_amount INTEGER NOT NULL DEFAULT 0,
  participants_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_group_snapshots_unique UNIQUE (funnel_id, campaign_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_group_snapshots_funnel_date
  ON funnel_group_snapshots(funnel_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_snapshots_campaign
  ON funnel_group_snapshots(funnel_id, campaign_id);
