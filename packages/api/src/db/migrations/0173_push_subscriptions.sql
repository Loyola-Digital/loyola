-- Aparelhos inscritos para receber notificação push (Web Push / VAPID).
-- A chave única é o endpoint porque é ele que identifica o aparelho: o mesmo
-- usuário tem uma linha por navegador, e o navegador pode trocar o endpoint.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  last_success_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
