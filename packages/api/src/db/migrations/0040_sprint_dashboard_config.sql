-- Migration 0040 — Epic 31 Story 31.1
-- Tabela singleton pra config global do Sprint Dashboard.
-- UNIQUE(singleton) garante que so 1 row existe (insert duplicado -> conflict).

CREATE TABLE IF NOT EXISTS "sprint_dashboard_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "singleton" boolean NOT NULL DEFAULT true,
  "blocks" jsonb NOT NULL DEFAULT '[]',
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sprint_dashboard_config_singleton_uniq" UNIQUE ("singleton")
);

CREATE INDEX IF NOT EXISTS "idx_sprint_dashboard_config_singleton"
  ON "sprint_dashboard_config" ("singleton");
