-- Preferências de notificação por pessoa.
--
-- Separado das regras de alerta de propósito: a regra é do projeto e vale para
-- todo mundo que o segue; isto é de cada um. Poder desligar SÓ o resumo e
-- manter os alertas é o que impede a pessoa de desligar tudo quando o resumo
-- incomoda.
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  resumo_ativo     boolean NOT NULL DEFAULT true,
  -- Hora local de São Paulo. O resumo é do dia ANTERIOR (fechado): às 8h o dia
  -- de hoje está vazio, e um resumo de zeros é pior que resumo nenhum.
  hora_do_resumo   integer NOT NULL DEFAULT 8,
  last_digest_date text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_prefs_hora_check CHECK (hora_do_resumo BETWEEN 0 AND 23)
);
