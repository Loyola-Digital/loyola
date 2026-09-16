-- Seguidores por post preenchidos à mão.
--
-- A Meta entrega `follows` por post só para foto e carrossel; em Reels ela
-- recusa a métrica ("does not support the follows metric for this media
-- product type") — medido em 15/09/2026. O número existe no painel do
-- Instagram, e é o time que copia de lá.
--
-- Coluna separada de `follows` de propósito: o que a API devolve e o que
-- alguém digitou não podem se misturar. Se um dia a Meta liberar a métrica
-- para Reels, o valor dela entra em `follows` sem apagar o que foi digitado, e
-- a tela mostra qual é qual.

ALTER TABLE instagram_post_metrics
  ADD COLUMN IF NOT EXISTS follows_manual integer,
  ADD COLUMN IF NOT EXISTS follows_manual_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follows_manual_at timestamptz;
