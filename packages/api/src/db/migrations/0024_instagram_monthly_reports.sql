-- Migration: instagram_monthly_reports (EPIC-24 - Story 24.1)
-- Persistencia de snapshots mensais de relatorio de Instagram por projeto.
-- Cada projeto tem ate 1 relatorio por mes; regenerar substitui via upsert.

CREATE TABLE instagram_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  data JSONB NOT NULL,
  generated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_instagram_monthly_report_project_month
  ON instagram_monthly_reports(project_id, month);

CREATE INDEX idx_instagram_monthly_reports_project_generated_at
  ON instagram_monthly_reports(project_id, generated_at DESC);
