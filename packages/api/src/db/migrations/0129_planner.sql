-- Planner de campanhas — o calendário do time, por campanha e fase.
--
-- ## Por que as fases são JSONB, e não tabela
--
-- A unidade de edição é a CAMPANHA: quem mexe arrasta uma fase, renomeia
-- outra, apaga uma terceira, e espera que isso seja uma alteração só. Com fase
-- em tabela própria, cada gesto viraria três statements e um problema de
-- ordenação; com JSONB, é um UPDATE. Não há consulta que precise filtrar fase
-- isoladamente — todas leem a campanha inteira para desenhar a barra.
--
-- ## Por que `project_id` é opcional
--
-- O planner é do TIME e nasce antes do projeto existir no app: "FZ — BLACK" é
-- planejado meses antes de virar funil. Amarrar ao projeto na criação impediria
-- justamente o uso principal. Quando o projeto existir, o vínculo permite
-- cruzar o planejado com o que aconteceu.
CREATE TABLE IF NOT EXISTS planner_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  -- Hex com #. A cor identifica a campanha em todas as três visões.
  color varchar(9) NOT NULL DEFAULT '#6D5BD0',
  -- Ordem manual na lista. Não é o índice do array: aqui a linha sobrevive à
  -- reordenação, e duas pessoas mexendo não embaralham a lista uma da outra.
  sort_order integer NOT NULL DEFAULT 0,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  /*
   * [{ id, name, start, end }] — datas como texto ISO `YYYY-MM-DD` ou "".
   *
   * Texto e não `date`: "fim em aberto" é um estado de verdade no planejamento
   * (a fase começou e ninguém sabe quando acaba), e `null` num array JSONB é
   * mais frágil de ler que string vazia.
   */
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planner_campaigns_ordem_idx ON planner_campaigns (sort_order, created_at);
CREATE INDEX IF NOT EXISTS planner_campaigns_project_idx ON planner_campaigns (project_id);
