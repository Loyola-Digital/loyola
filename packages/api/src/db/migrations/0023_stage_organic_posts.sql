-- Migration: stage_organic_posts (EPIC-23 - Story 23.1)
-- Vincula posts organicos (YouTube + Instagram) a etapas de funil (N:N).
-- - source: enum organic_post_source ('youtube' | 'instagram')
-- - external_id: videoId (YouTube) ou mediaId (Instagram), nao FK
-- - hidratacao de metricas eh feita on-demand no GET via APIs externas

CREATE TYPE organic_post_source AS ENUM ('youtube', 'instagram');

CREATE TABLE stage_organic_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source organic_post_source NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_stage_organic_post
  ON stage_organic_posts(stage_id, source, external_id);

CREATE INDEX idx_stage_organic_posts_stage
  ON stage_organic_posts(stage_id);

CREATE INDEX idx_stage_organic_posts_project_source
  ON stage_organic_posts(project_id, source);
