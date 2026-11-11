-- Metas do mês de uma conta do Instagram.
--
-- Sem meta não existe semáforo: "683 mil de alcance" não é bom nem ruim até
-- alguém dizer o que se esperava. É a linha que transforma a tela de relatório
-- em tela de decisão.
--
-- Metas por formato em JSONB: são três números para cada um dos três formatos
-- (posts por semana, alcance mediano por post, interesse por mil) e mudam
-- juntas. Nove colunas diriam o mesmo e pediriam migration a cada formato novo.
CREATE TABLE IF NOT EXISTS instagram_monthly_goals (
  account_id        uuid        NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  mes               varchar(7)  NOT NULL,
  saldo_seguidores  integer,
  alcance           integer,
  posts             integer,
  metas_por_formato jsonb,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_por    uuid        REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (account_id, mes)
);
