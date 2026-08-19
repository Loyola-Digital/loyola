-- Plausible Analytics (self-hosted) como alternativa ao GA4.
--
-- A instância é UMA só pra todos os experts, então a credencial é global
-- (singleton) — diferente do GA4, que exige um OAuth por cliente. O que muda
-- por projeto é só qual site daquela instância ler.
CREATE TABLE IF NOT EXISTS plausible_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT true,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma linha só: a segunda tentativa dá conflito em vez de criar config
-- duplicada em silêncio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plausible_config_singleton
  ON plausible_config(singleton);

-- A presença da linha aqui é o que DESLIGA o GA4 do projeto — a rota de
-- analytics decide a fonte por isto, e não por uma flag separada que poderia
-- divergir do que está configurado.
CREATE TABLE IF NOT EXISTS plausible_project_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  -- `site_id` do Plausible é o domínio cadastrado lá (ex.: "loja.exemplo.com").
  site_id VARCHAR(255) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plausible_sites_project
  ON plausible_project_sites(project_id);
