-- Personalização da faixa colorida do calendário anual (nome e cor).
--
-- As três chaves (organico | trafego | ascensao) seguem FIXAS no código: o
-- pedido foi renomear e recolorir a faixa, não criar grupos novos, e manter a
-- chave estável é o que permite `planner_annual_tracks.grupo` continuar sendo
-- um texto curto sem virar chave estrangeira.
--
-- ## Só existe linha para o que mudou
--
-- Nada é semeado. Empresa que nunca mexeu na faixa não tem linha aqui, e lê o
-- padrão do código — que é o que permite mudar o padrão depois e alcançar
-- todas elas de uma vez. Rótulo ou cor nulos caem no padrão do mesmo jeito, e
-- é assim que apagar o nome no painel restaura o original.

CREATE TABLE IF NOT EXISTS planner_annual_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- organico | trafego | ascensao
  grupo varchar(20) NOT NULL,
  -- NULL = o rótulo padrão do código.
  rotulo varchar(40),
  -- '#rrggbb' minúsculo. NULL = a cor padrão do código.
  cor varchar(7),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma personalização por empresa/grupo. É o que permite gravar com
-- `ON CONFLICT` sem consultar antes se a empresa já tinha mexido na faixa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_annual_groups_projeto
  ON planner_annual_groups (project_id, grupo);
