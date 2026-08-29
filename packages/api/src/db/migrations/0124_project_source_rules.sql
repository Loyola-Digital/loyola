-- Story 44.x — a regra de origem passa a valer no PROJETO, não na etapa.
--
-- O `utm_source` "instagram" significa a mesma coisa em qualquer funil e em
-- qualquer etapa do mesmo projeto. Classificar de novo a cada etapa era pedir
-- para as respostas divergirem: a captação diria orgânico e a venda diria pago,
-- sobre a MESMA linha da MESMA planilha.
--
-- A tabela antiga está vazia (nenhuma regra foi criada), então não há migração
-- de dados — só a troca de escopo.

CREATE TABLE IF NOT EXISTS project_source_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campo       VARCHAR(120) NOT NULL,
  operador    source_rule_operator NOT NULL DEFAULT 'igual',
  valor       TEXT NOT NULL DEFAULT '',
  origem      VARCHAR(120) NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativa       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_source_rules_project
  ON project_source_rules(project_id, ordem);

DROP TABLE IF EXISTS stage_source_rules;
