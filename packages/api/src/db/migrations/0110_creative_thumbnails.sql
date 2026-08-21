-- Miniatura do criativo guardada como ARQUIVO, não como link.
--
-- meta_ad_creatives_cache guarda a URL que a Meta devolve, e ela é assinada:
-- expira. Enquanto vale a imagem aparece; depois quebra sozinha na tela, e a
-- única saída seria bater na Meta a cada visita — justamente o que se quer
-- evitar. Com os bytes aqui, a tela abre sem nenhuma chamada externa e o
-- download do CDN acontece uma vez por criativo.
CREATE TABLE IF NOT EXISTS meta_creative_thumbnails (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ad_id VARCHAR(64) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  conteudo BYTEA NOT NULL,
  source_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, ad_id)
);
