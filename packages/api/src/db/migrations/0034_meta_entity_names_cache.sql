-- Story 28.7: cache persistente de nomes Meta (ad/adset/campaign) por projeto.
-- Substitui resolução in-memory que estourava rate limit Meta (200 req/h) ao
-- resolver muitos ad_ids por refresh.
-- TTL aplicado no código (24h) — query usa `last_synced_at > NOW() - interval '24h'`.

CREATE TABLE IF NOT EXISTS meta_entity_names_cache (
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type    VARCHAR(20) NOT NULL,
  entity_id      VARCHAR(64) NOT NULL,
  entity_name    VARCHAR(500) NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, entity_type, entity_id),
  CONSTRAINT chk_meta_entity_type CHECK (entity_type IN ('ad','adset','campaign'))
);

CREATE INDEX IF NOT EXISTS idx_meta_names_cache_lookup
  ON meta_entity_names_cache (project_id, entity_type, last_synced_at);
