-- Regras de alerta de funil e quem segue cada projeto.
--
-- O escopo é o PROJETO, não o funil: o gasto de mídia não é registrado por
-- funil nem por etapa, então uma regra por funil mostraria um número que o
-- dado não sustenta.
CREATE TABLE IF NOT EXISTS alert_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metrica        text NOT NULL,
  comparador     text NOT NULL DEFAULT 'menor',
  valor          numeric(14,4) NOT NULL,
  gasto_minimo   numeric(14,2),
  janela_dias    integer NOT NULL DEFAULT 1,
  ativo          boolean NOT NULL DEFAULT true,
  last_sent_date text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_rules_metrica_check
    CHECK (metrica IN ('connect_rate', 'roas', 'investiu_sem_vender')),
  CONSTRAINT alert_rules_comparador_check CHECK (comparador IN ('menor', 'maior')),
  CONSTRAINT alert_rules_janela_check CHECK (janela_dias BETWEEN 1 AND 30)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_project ON alert_rules (project_id);

-- Seguir é vontade, ser membro é permissão: são coisas diferentes de propósito.
CREATE TABLE IF NOT EXISTS notification_follows (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_follows_project ON notification_follows (project_id);
