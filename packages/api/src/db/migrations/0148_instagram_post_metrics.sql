-- Métricas de cada post do Instagram, guardadas de vez.
--
-- Antes, elas só existiam no cache de 15 minutos: cada abertura do dashboard
-- disparava uma chamada de insights POR POST (100 de uma vez) e estourava o
-- limite de 200 chamadas/hora que a Meta impõe por conta — a tela respondia
-- 429. Aqui elas ficam: o número de um post de ontem não muda mais, e ler do
-- banco não custa chamada nenhuma.
--
-- `insights_at` marca quando as métricas foram buscadas; é o que decide se
-- vale a pena perguntar de novo (ver `precisaBuscarInsights`).

CREATE TABLE IF NOT EXISTS instagram_post_metrics (
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  media_id varchar(64) NOT NULL,
  posted_at timestamptz NOT NULL,
  media_type varchar(32),
  media_product_type varchar(32),
  caption text,
  permalink text,
  like_count integer,
  comments_count integer,
  reach integer,
  views integer,
  saved integer,
  shares integer,
  follows integer,
  -- % das views do Reels que pularam nos 3 primeiros segundos.
  skip_rate numeric(5, 2),
  avg_watch_time_ms integer,
  insights_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_post_metrics_conta_data
  ON instagram_post_metrics (account_id, posted_at DESC);
