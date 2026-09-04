-- Base horária de investimento do Perpétuo (Story 29.69).
--
-- ## Por que cache no banco, e não chamada direta
--
-- O breakdown `hourly_stats_aggregated_by_advertiser_time_zone` devolve 24
-- linhas por dia por campanha. Um mês de um funil com 13 campanhas são ~9.000
-- linhas — 24× o custo do sync diário atual. Consultar a Meta a cada abertura
-- do dashboard é o caminho que já derrubou endpoints inteiros desta API em
-- 2026-07-16. A regra do repo: consultar em lote, gravar aqui, ler daqui.
--
-- ## Por que a campanha está na CHAVE
--
-- A primeira versão desta tabela (Story 29.69, primeira parte) era
-- `(project_id, date_start, hour)`. Isso não sobrevive ao dado real: o BBE tem
-- TRÊS funis perpétuos no mesmo projeto (`bbe-fc1-a1`, `bbe-fc1-a2`, `bbe-fh`),
-- cada um com o seu conjunto de campanhas. O sync de um sobrescreveria o do
-- outro na mesma linha, e o gráfico "por hora" de um funil passaria a mostrar o
-- investimento do outro — sem erro, sem aviso, com o número parecendo certo.
--
-- Verificado contra a API antes de mudar (conta do BBE, 3 dias):
-- `level=campaign` com o breakdown horário devolve HTTP 200, 360 linhas, e a
-- soma bate EXATAMENTE com `level=account` — R$ 1.470,67 nos dois. Guardar por
-- campanha não perde nem duplica gasto; só permite recortar por funil depois.
--
-- ## `hour` é no fuso da CONTA
--
-- A Meta reporta as faixas no fuso do anunciante, e a venda é carimbada no fuso
-- do negócio. `account_timezone` guarda qual era o fuso na coleta para que a
-- tela possa dizer "não verificado" em vez de sobrepor duas séries que não
-- estão no mesmo eixo. Na conta do BBE os dois são `America/Sao_Paulo`.

CREATE TABLE IF NOT EXISTS meta_hourly_insights_daily (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_start VARCHAR(10) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  hour INTEGER NOT NULL,
  spend NUMERIC NOT NULL DEFAULT '0',
  impressions NUMERIC NOT NULL DEFAULT '0',
  clicks NUMERIC NOT NULL DEFAULT '0',
  account_timezone VARCHAR(64),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, date_start, campaign_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_meta_hourly_insights_lookup
  ON meta_hourly_insights_daily (project_id, date_start);
