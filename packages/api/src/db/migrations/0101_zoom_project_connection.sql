-- Zoom: a conexão (Server-to-Server OAuth) passa a ser POR PROJETO, não mais
-- por etapa do funil. Mesmo padrão do Mautic (mautic_connections): 1 credencial
-- por cliente, reutilizada por todas as etapas CPL.
--
-- As conexões que já existiam viram globais do projeto. Quando um projeto tinha
-- mais de uma etapa conectada, vence a mais recentemente atualizada.
--
-- As reuniões vinculadas (funnel_stage_zoom_meetings) continuam POR ETAPA — só
-- a credencial virou global.
--
-- Idempotente: o backfill/drop só roda se a tabela antiga ainda existir.

CREATE TABLE IF NOT EXISTS project_zoom_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  account_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  client_secret_iv TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_zoom_connections_project ON project_zoom_connections(project_id);

DO $$
BEGIN
  IF to_regclass('public.funnel_stage_zoom_connections') IS NOT NULL THEN
    INSERT INTO project_zoom_connections (
      project_id, account_id, client_id, client_secret_encrypted, client_secret_iv, created_at, updated_at
    )
    SELECT DISTINCT ON (f.project_id)
      f.project_id,
      c.account_id,
      c.client_id,
      c.client_secret_encrypted,
      c.client_secret_iv,
      c.created_at,
      c.updated_at
    FROM funnel_stage_zoom_connections c
    JOIN funnel_stages s ON s.id = c.stage_id
    JOIN funnels f ON f.id = s.funnel_id
    ORDER BY f.project_id, c.updated_at DESC
    ON CONFLICT (project_id) DO NOTHING;

    DROP TABLE funnel_stage_zoom_connections;
  END IF;
END
$$;
