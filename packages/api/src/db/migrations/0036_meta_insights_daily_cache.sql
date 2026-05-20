-- Story 18.26 Fase 3: cache persistente de insights diarios (campaign + ad).
-- Insights de dias > 7 dias atras nao mudam mais pela Meta -- servem do DB
-- indefinidamente. Dias 1-7 atras: TTL 24h. Dia atual: TTL 30min. Caller
-- aplica TTL no SELECT baseado na data da linha + last_synced_at.

CREATE TABLE IF NOT EXISTS meta_campaign_insights_daily (
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id    VARCHAR(64) NOT NULL,
  date_start     VARCHAR(10) NOT NULL,
  spend          NUMERIC NOT NULL DEFAULT 0,
  impressions    NUMERIC NOT NULL DEFAULT 0,
  reach          NUMERIC NOT NULL DEFAULT 0,
  clicks         NUMERIC NOT NULL DEFAULT 0,
  actions        JSONB,
  action_values  JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, campaign_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_insights_lookup
  ON meta_campaign_insights_daily (project_id, campaign_id, date_start);

CREATE TABLE IF NOT EXISTS meta_ad_insights_daily (
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ad_id          VARCHAR(64) NOT NULL,
  date_start     VARCHAR(10) NOT NULL,
  adset_id       VARCHAR(64),
  adset_name     VARCHAR(500),
  campaign_id    VARCHAR(64),
  campaign_name  VARCHAR(500),
  ad_name        VARCHAR(500),
  spend          NUMERIC NOT NULL DEFAULT 0,
  impressions    NUMERIC NOT NULL DEFAULT 0,
  reach          NUMERIC NOT NULL DEFAULT 0,
  clicks         NUMERIC NOT NULL DEFAULT 0,
  actions        JSONB,
  action_values  JSONB,
  video_metrics  JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, ad_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_campaign
  ON meta_ad_insights_daily (project_id, campaign_id, date_start);
