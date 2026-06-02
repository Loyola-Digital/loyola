-- Migration 0042 — Story 10.8
-- Coluna sort_order pra reordenacao manual de funis no sidebar.
-- Hard rule (perpetuos sempre antes de lancamentos) e aplicada na rota,
-- nao no schema. sort_order eh somente a ordem dentro do tipo.

ALTER TABLE "funnels"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

-- Backfill: ordem inicial = posicao cronologica dentro do tipo (0-indexed).
-- Idempotente: roda novamente sem efeito colateral porque sobrescreve com
-- mesmo valor calculado.
WITH ranked AS (
  SELECT
    id,
    (row_number() OVER (PARTITION BY type ORDER BY created_at ASC) - 1)::integer AS rn
  FROM funnels
)
UPDATE funnels f
SET sort_order = ranked.rn
FROM ranked
WHERE f.id = ranked.id;

CREATE INDEX IF NOT EXISTS "idx_funnels_project_sort"
  ON "funnels" ("project_id", "type", "sort_order");
