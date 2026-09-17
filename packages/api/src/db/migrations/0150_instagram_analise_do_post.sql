-- A análise de IA de cada post, guardada.
--
-- Uma análise custa uma chamada ao modelo e leva dezenas de segundos. O post
-- não muda depois de publicado, então reanalisar a cada abertura do modal
-- seria queimar dinheiro para reescrever o mesmo texto.
--
-- Fica na mesma linha das métricas: é sobre aquele post, e não existe sem ele.
-- `analise_em` permite mostrar quando foi feita e o botão "Refazer" a
-- sobrescreve.

ALTER TABLE instagram_post_metrics
  ADD COLUMN IF NOT EXISTS analise jsonb,
  ADD COLUMN IF NOT EXISTS analise_em timestamptz,
  ADD COLUMN IF NOT EXISTS analise_por uuid REFERENCES users(id) ON DELETE SET NULL;
