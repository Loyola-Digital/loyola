-- A regra de origem passa a poder valer para TODOS os projetos.
--
-- O caso que motivou: um link mal montado entrega `{whatsapp}` — a macro com
-- as chaves literais, sem substituição. Isso não é um problema de um projeto,
-- é do formato do link, e acontece igual em qualquer campanha. Cadastrar a
-- mesma correção projeto a projeto seria trabalho repetido e fatalmente
-- desatualizado num deles.
--
-- `project_id` NULL = global. A coluna continua existindo porque uma regra
-- específica de um cliente ("origem `parceiro-x` é orgânico") continua fazendo
-- sentido, e jogar essa possibilidade fora agora fecharia uma porta sem ganho.
ALTER TABLE project_source_rules
  ALTER COLUMN project_id DROP NOT NULL;

-- Índice para a leitura das globais, que agora acontece em toda consulta.
CREATE INDEX IF NOT EXISTS project_source_rules_globais_idx
  ON project_source_rules (ordem) WHERE project_id IS NULL;
