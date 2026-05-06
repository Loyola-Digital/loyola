-- Migration: add survey_type to funnel_surveys
-- Motivo: permitir conectar uma pesquisa "orgânica" (alunos / não captados via tráfego)
-- separadamente da pesquisa "paga" (leads de tráfego).

-- 1. Cria enum survey_type
DO $$ BEGIN
  CREATE TYPE survey_type AS ENUM ('paid', 'organic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Adiciona coluna survey_type com default 'paid' (compat retro)
ALTER TABLE funnel_surveys
ADD COLUMN survey_type survey_type NOT NULL DEFAULT 'paid';

-- 3. Index pra filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_funnel_surveys_type ON funnel_surveys(survey_type);
