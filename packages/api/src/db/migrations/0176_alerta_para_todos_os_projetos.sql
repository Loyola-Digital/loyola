-- Regra de alerta que vale para TODOS os projetos: `project_id` nulo.
--
-- Uma regra só ("ROAS abaixo de 1") passa a valer em qualquer projeto que
-- alguém siga, em vez de ter de ser recriada projeto a projeto. Regra com
-- `project_id` preenchido continua valendo só ali.
ALTER TABLE alert_rules ALTER COLUMN project_id DROP NOT NULL;

-- O "já avisei hoje" vira por (regra, projeto): a mesma regra global dispara em
-- projetos diferentes, e um `last_sent_date` só na regra calaria os outros
-- depois do primeiro aviso do dia.
CREATE TABLE IF NOT EXISTS alert_rule_state (
  rule_id        uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  last_sent_date text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, project_id)
);

-- Some sem migrar nada: a coluna nasceu hoje (0174) e a tabela está vazia.
ALTER TABLE alert_rules DROP COLUMN IF EXISTS last_sent_date;
