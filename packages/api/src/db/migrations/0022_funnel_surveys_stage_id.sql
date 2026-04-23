-- Migration: add stage_id to funnel_surveys
-- Motivo: pesquisas conectadas numa stage vazavam para todas as stages do mesmo
-- funil. Mesmo pattern do fix 0020 para funnel_spreadsheets.

-- 1. Adiciona coluna stage_id (nullable — compat legada)
ALTER TABLE funnel_surveys
ADD COLUMN stage_id UUID REFERENCES funnel_stages(id) ON DELETE CASCADE;

CREATE INDEX idx_funnel_surveys_stage ON funnel_surveys(stage_id);

-- 2. Backfill: associa pesquisas legacy à PRIMEIRA stage (sort_order=0) do funil
UPDATE funnel_surveys fs
SET stage_id = (
  SELECT id FROM funnel_stages
  WHERE funnel_id = fs.funnel_id
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
)
WHERE fs.stage_id IS NULL;
