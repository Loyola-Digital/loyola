-- Epic 45 — Construtor de BI: o documento do dashboard.
--
-- `widgets` guarda definição e geometria, nunca resultado: número persistido é
-- número velho com cara de atual.

CREATE TABLE IF NOT EXISTS bi_dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nome        VARCHAR(200) NOT NULL,
  widgets     JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_range  JSONB NOT NULL DEFAULT '{"preset":"last_30d"}'::jsonb,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_dashboards_project ON bi_dashboards(project_id);
