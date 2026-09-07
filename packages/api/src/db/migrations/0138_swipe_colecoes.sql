-- Coleções do Swipe Files: o agrupamento que a pessoa faz à mão.
--
-- ## Por que não uma coluna em swipe_files
--
-- Uma peça pertence a MAIS DE UMA coleção — o mesmo criativo de Black Friday
-- serve à coleção do lançamento do Pedro e à de referências de escassez. Uma
-- coluna `collection_id` obrigaria a escolher uma, e a segunda escolha viraria
-- uma cópia do arquivo no bucket.
--
-- É também por isso que a UI chama de "coleção" e não de "pasta": pasta cria
-- a expectativa de que o arquivo está num lugar só.
--
-- ## Separado dos atributos que a IA preenche
--
-- Marca, nicho e formato já agrupam o acervo sozinhos, e a tela agrupa por eles
-- sem tabela nenhuma. Estas coleções existem para o critério que NÃO está nos
-- campos: "o que mandei pro cliente", "o que vou usar no lançamento".

CREATE TABLE IF NOT EXISTS swipe_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(120) NOT NULL,
  descricao text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nome único, sem caixa: "Black Friday" e "black friday" são a mesma coleção,
-- e duas com o mesmo nome deixariam a lista impossível de usar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipe_collections_nome
  ON swipe_collections (lower(nome));

CREATE TABLE IF NOT EXISTS swipe_collection_items (
  collection_id uuid NOT NULL REFERENCES swipe_collections(id) ON DELETE CASCADE,
  swipe_id uuid NOT NULL REFERENCES swipe_files(id) ON DELETE CASCADE,
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, swipe_id)
);

-- Para responder "em que coleções esta peça está?" sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_swipe_collection_items_peca
  ON swipe_collection_items (swipe_id);
