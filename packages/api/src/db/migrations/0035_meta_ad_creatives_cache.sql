-- Story 18.26 Fase 2: cache persistente de creative metadata Meta (image_url,
-- thumbnail_url, video_id, title, body, link_url, cta_type, object_type).
-- Complementa meta_entity_names_cache (Story 28.7) que só cobre nomes.
-- TTL 24h aplicado no código.

CREATE TABLE IF NOT EXISTS meta_ad_creatives_cache (
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ad_id          VARCHAR(64) NOT NULL,
  creative       JSONB NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_creatives_lookup
  ON meta_ad_creatives_cache (project_id, last_synced_at);
