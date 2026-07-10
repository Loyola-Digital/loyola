-- Alerta diário de pagamentos (Evento Presencial): config por etapa de evento
-- pra avisar num canal do ClickUp quem deve pagar parcela HOJE, mencionando
-- colaboradores. last_sent_date deduplica o envio diário. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_event_payment_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL UNIQUE REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "channel_id" text NOT NULL,
  "channel_name" text,
  "mention_users" jsonb NOT NULL DEFAULT '[]',
  "last_sent_date" date,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
