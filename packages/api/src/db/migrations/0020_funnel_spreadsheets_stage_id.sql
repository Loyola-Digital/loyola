-- Migration: Add stage_id to funnel_spreadsheets
-- Motivo: planilhas configuradas numa stage estavam vazando para outras stages
-- do mesmo funil. Agora cada stage tem suas próprias planilhas.

-- 1. Adiciona coluna stage_id (nullable — compat com dados legados)
ALTER TABLE funnel_spreadsheets
ADD COLUMN stage_id UUID REFERENCES funnel_stages(id) ON DELETE CASCADE;

CREATE INDEX idx_funnel_spreadsheets_stage ON funnel_spreadsheets(stage_id);

-- 2. Backfill: associa planilhas legacy à PRIMEIRA stage (sort_order=0) do funil.
--    Usuário pode reassociar depois pelo UI se preferir outra stage.
UPDATE funnel_spreadsheets fs
SET stage_id = (
  SELECT id FROM funnel_stages
  WHERE funnel_id = fs.funnel_id
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
)
WHERE fs.stage_id IS NULL;
