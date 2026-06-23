-- Epic 35+: "tudo da Meta no banco". Duas tabelas novas (aditivas):
--   1. meta_placement_insights_daily: breakdown de placement por dia
--      (publisher_platform x platform_position). Nao e derivavel de
--      meta_ad_insights_daily, entao tem tabela propria. Grao diario para somar
--      qualquer range. Populado so pelo sync; a rota /placements le daqui.
--   2. meta_sync_state: estado do sync por (projeto, conta, tipo). Fonte do selo
--      "atualizado ha X" e da observabilidade do producer.

CREATE TABLE IF NOT EXISTS meta_placement_insights_daily (
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_start         VARCHAR(10) NOT NULL,
  publisher_platform VARCHAR(64) NOT NULL,
  platform_position  VARCHAR(64) NOT NULL,
  spend              NUMERIC NOT NULL DEFAULT 0,
  impressions        NUMERIC NOT NULL DEFAULT 0,
  clicks             NUMERIC NOT NULL DEFAULT 0,
  actions            JSONB,
  action_values      JSONB,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, date_start, publisher_platform, platform_position)
);

CREATE INDEX IF NOT EXISTS idx_meta_placement_insights_lookup
  ON meta_placement_insights_daily (project_id, date_start);

CREATE TABLE IF NOT EXISTS meta_sync_state (
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id      VARCHAR(64) NOT NULL,
  kind            VARCHAR(32) NOT NULL,
  last_run_at     TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  rows_upserted   INTEGER NOT NULL DEFAULT 0,
  status          VARCHAR(16),
  error           TEXT,
  duration_ms     INTEGER,
  PRIMARY KEY (project_id, account_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_meta_sync_state_project
  ON meta_sync_state (project_id);
