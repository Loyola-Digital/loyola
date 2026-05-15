-- Story Zoom Background Sync: cache persistente de participantes por reunião
-- Quando uma reunião é vinculada, sync dispara em background e salva o
-- response completo aqui pra requests futuras serem instantâneas.

ALTER TABLE funnel_stage_zoom_meetings
  ADD COLUMN IF NOT EXISTS cached_data JSONB,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;
