-- Migration 0043 — Story 10.9
-- Soft archive de funis. archived_at NULL = ativo, NOT NULL = arquivado.
-- archived_by guarda quem arquivou pra audit minimo (FK SET NULL pra nao
-- quebrar se o user sumir).

ALTER TABLE "funnels"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "archived_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- Index parcial: acelera o GET default (so ativos). Como o app filtra
-- archived_at IS NULL na maioria das leituras, indexar so esse subset
-- economiza disco e mantem o planner rapido.
CREATE INDEX IF NOT EXISTS "idx_funnels_active"
  ON "funnels" ("project_id") WHERE "archived_at" IS NULL;
