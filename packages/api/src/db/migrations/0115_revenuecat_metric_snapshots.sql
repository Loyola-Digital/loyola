-- Story 42.10 — um ponto por dia das métricas do RevenueCat.
--
-- `/v2/projects/{id}/metrics/overview` devolve o estado de AGORA. Não existe
-- endpoint que devolva o MRR de uma data passada: cada dia sem gravar é um
-- ponto perdido para sempre. MRR Movement e Cohort dependem desta série.
--
-- `metrics` é JSONB e não uma coluna por métrica porque a API devolve 6 hoje e
-- pode devolver uma sétima amanhã — coluna por métrica exigiria migration a
-- cada mudança do provedor.
--
-- ⚠️ `revenue` e `new_customers` são acumulados de 28 DIAS. A diferença entre
-- dois dias consecutivos NÃO é a receita do dia: as janelas se sobrepõem em 27.
CREATE TABLE IF NOT EXISTS revenuecat_metric_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  rc_project_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  metrics       JSONB NOT NULL,
  collected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rodar duas vezes no mesmo dia atualiza, não duplica (AC3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_snapshot_stage_date
  ON revenuecat_metric_snapshots (stage_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_rc_snapshot_stage_date
  ON revenuecat_metric_snapshots (stage_id, snapshot_date);
