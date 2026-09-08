-- Registro de uso do Loyola X, para medir adesão do time.
--
-- ## Uma linha por usuário, área e HORA
--
-- Não por requisição. Uma tela faz dezenas de chamadas; gravar cada uma daria
-- milhões de linhas por ano para responder uma pergunta que se satisfaz com
-- "esteve ativo nesta hora, nesta área". Assim cabe em algumas centenas de
-- linhas por dia e mantém o que importa: dias ativos e áreas usadas.
--
-- ## O que NÃO está aqui, de propósito
--
-- URL completa, parâmetro, corpo, e qual registro foi aberto. A pergunta é
-- "o time está usando o produto?", e ela se responde com área e frequência.
-- O caminho inteiro responderia "fulano abriu o funil do cliente X às 14h32" —
-- vigiar pessoa em vez de medir produto, e um dado que ninguém quer ter de
-- proteger.

CREATE TABLE IF NOT EXISTS user_activity (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- swipe | mapas | planner | funis | bi | ... (ver services/adesao.ts)
  area varchar(24) NOT NULL,
  -- Hora cheia em UTC.
  hora timestamptz NOT NULL,
  requisicoes integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, area, hora)
);

-- Responde "quem esteve ativo nos últimos 30 dias" sem varrer a tabela toda.
CREATE INDEX IF NOT EXISTS idx_user_activity_hora ON user_activity (hora DESC);
