-- Story Zoom Stage Integration: conexão Zoom (Server-to-Server OAuth) e
-- reuniões vinculadas por etapa do funil. 1 conexão por stage; N reuniões.

CREATE TABLE IF NOT EXISTS funnel_stage_zoom_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL UNIQUE REFERENCES funnel_stages(id) ON DELETE CASCADE,
  account_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  client_secret_iv TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoom_connections_stage ON funnel_stage_zoom_connections(stage_id);

CREATE TABLE IF NOT EXISTS funnel_stage_zoom_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  meeting_id VARCHAR(64) NOT NULL,
  meeting_uuid VARCHAR(255) NOT NULL,
  topic VARCHAR(500),
  label VARCHAR(255),
  start_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zoom_meetings_stage_uuid ON funnel_stage_zoom_meetings(stage_id, meeting_uuid);
CREATE INDEX IF NOT EXISTS idx_zoom_meetings_stage ON funnel_stage_zoom_meetings(stage_id);
