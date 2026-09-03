-- Mapa de funil pode existir sem funil.
--
-- Até aqui todo mapa era de uma ETAPA do tipo `mapa`, dentro de um funil,
-- dentro de um projeto — três níveis antes de existir um desenho. Isso impede
-- justamente o primeiro uso: rascunhar o funil de um cliente que ainda não
-- está no sistema.
--
-- ## O nome vinha da etapa
--
-- Sem etapa não há de onde tirá-lo, então a tabela ganha `name` próprio. Para
-- os mapas que já existem o campo fica vazio e a leitura continua usando o
-- nome da etapa — `coalesce(stage.name, map.name)`.
--
-- ## Empresa é opcional junto com o funil
--
-- Um rascunho pode já ser "da FZ" sem estar preso a um lançamento. Sem
-- projeto, o mapa é interno: a regra de acesso hoje é "membro do projeto", e
-- sem projeto não há membro para conferir.

ALTER TABLE funnel_maps ALTER COLUMN stage_id DROP NOT NULL;

ALTER TABLE funnel_maps ADD COLUMN IF NOT EXISTS name varchar(160);
ALTER TABLE funnel_maps ADD COLUMN IF NOT EXISTS project_id uuid
  REFERENCES projects(id) ON DELETE SET NULL;

-- Índice para a segunda consulta da lista global: os mapas que não têm etapa
-- não aparecem no join por `funnel_stages` e vêm por aqui.
CREATE INDEX IF NOT EXISTS idx_funnel_maps_soltos
  ON funnel_maps (project_id)
  WHERE stage_id IS NULL;
