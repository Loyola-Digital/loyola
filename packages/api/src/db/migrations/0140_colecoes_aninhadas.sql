-- Coleções aninhadas: subir uma pasta preserva a estrutura dela.
--
-- `Black Friday/anúncios/peça.png` cria "Black Friday" e, dentro dela,
-- "anúncios". Achatar tudo numa coleção só perderia a arrumação que a pessoa
-- já tinha feito no computador — e refazer isso à mão depois é exatamente o
-- trabalho que subir a pasta deveria evitar.
--
-- ## CASCADE: apagar a mãe apaga as filhas
--
-- É o que "pasta" promete. As REFERÊNCIAS continuam na biblioteca de qualquer
-- forma — só o agrupamento cai, porque `swipe_collection_items` já tem o
-- cascade dela para cá.

ALTER TABLE swipe_collections
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES swipe_collections(id) ON DELETE CASCADE;

-- Responde "o que tem dentro desta coleção?" sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_swipe_collections_parent
  ON swipe_collections (parent_id);

-- O nome único passa a valer DENTRO da mãe: duas pastas diferentes podem ter
-- uma "anúncios" cada, e recusar a segunda faria a segunda pasta falhar
-- inteira. Na raiz, o nome segue único — é a lista que se vê primeiro.
DROP INDEX IF EXISTS idx_swipe_collections_nome;

CREATE UNIQUE INDEX IF NOT EXISTS idx_swipe_collections_nome_raiz
  ON swipe_collections (lower(nome)) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_swipe_collections_nome_filha
  ON swipe_collections (parent_id, lower(nome)) WHERE parent_id IS NOT NULL;
