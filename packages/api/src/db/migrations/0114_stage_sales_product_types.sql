-- Story 18.69 — a Captação Paga passa a classificar produto por TIPO, e não
-- por uma lista de "é bump ou não é".
--
-- O Perpétuo já faz isso desde a 29.49 (`funnel_spreadsheets.product_types`).
-- A Captação Paga tinha só `order_bump_products`, uma lista, que não consegue
-- expressar o COMBO — a oferta que substitui o ingresso com o extra embutido.
--
-- O que estava escondido por não haver esse tipo, medido no dg-pg02:
--   597 combos, R$ 143.156,20 = 65,97% da receita da captação, caindo em
--   `principal` e sumindo da análise. O dashboard reportava 6,2% de conversão
--   em order bump enquanto 32,1% dos compradores levavam a MESMA Gravação.
--
-- A coluna nasce NULA de propósito: enquanto não houver mapa, o backend lê a
-- lista antiga e o comportamento é idêntico ao de hoje. Nenhum dos 20
-- registros é reescrito neste deploy (AC2).
ALTER TABLE stage_sales_spreadsheets
  ADD COLUMN IF NOT EXISTS product_types JSONB;
