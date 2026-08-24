-- A partir de que dia o funil de comparação conta como "Dia 1".
--
-- A comparação alinha os dois lançamentos por dia de veiculação: D1 do atual
-- contra D1 do anterior. Isso assume que os dois começaram a valer no primeiro
-- dia de anúncio — e não é o caso quando o lançamento passado rodou tráfego por
-- semanas antes de abrir carrinho. Alinhado assim, o "Dia 1" do antigo é um dia
-- sem venda nenhuma, e a comparação fica torta do começo ao fim.
--
-- Com esta data, o time escolhe onde o lançamento anterior realmente começa.
-- Nulo = comportamento atual (primeiro dia com veiculação).
ALTER TABLE funnels
  ADD COLUMN IF NOT EXISTS compare_start_date VARCHAR(10);
