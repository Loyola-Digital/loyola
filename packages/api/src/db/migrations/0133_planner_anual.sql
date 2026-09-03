-- Calendário anual do Planner: matriz de esteiras × meses.
--
-- Outra escala do mesmo assunto. A campanha do Planner é um evento com fases
-- datadas ("FZ BLACK", cinco fases, no Google Calendar); a esteira é uma
-- máquina que roda todo mês ("Webinar diário", "Reunião secreta 3x"). Uma não
-- descreve a outra, e é por isso que estas tabelas não referenciam
-- `planner_campaigns`.
--
-- ## Uma linha por CÉLULA
--
-- São ~84 células por empresa/ano, e o uso real é clicar numa e escolher no
-- dropdown. Guardar a esteira inteira num JSONB faria mexer em Janeiro
-- reescrever os doze meses — que é exatamente como se perde a edição de outra
-- pessoa que estava em Março.
--
-- ## Isolado de propósito
--
-- A feature entra em teste e pode sair. Duas tabelas com prefixo próprio e
-- nenhuma coluna nova em tabela existente: remover é derrubar estas duas.

CREATE TABLE IF NOT EXISTS planner_annual_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- A faixa colorida da lateral: organico | trafego | ascensao.
  grupo varchar(20) NOT NULL,
  nome varchar(120) NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_annual_tracks_projeto
  ON planner_annual_tracks (project_id, sort_order);

CREATE TABLE IF NOT EXISTS planner_annual_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES planner_annual_tracks(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Texto livre: na planilha do time isso varia entre "Diário", "3x por mês" e
  -- "19, 20 e 21". Nenhuma lista fechada cobre os três.
  frequencia varchar(120),
  produto varchar(160),
  -- Back-End | Front-End
  categoria varchar(20),
  -- Lançamento | DR - VSL | Grupo de Conteúdo | Reunião Secreta | ...
  funil varchar(60),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma célula por esteira/ano/mês. É o que permite gravar com `ON CONFLICT` sem
-- precisar criar as 84 células vazias antes de alguém digitar a primeira.
CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_annual_cells_celula
  ON planner_annual_cells (track_id, ano, mes);
