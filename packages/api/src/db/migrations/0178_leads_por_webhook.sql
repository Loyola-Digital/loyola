-- Leads chegando por webhook (Mautic, n8n, LP) como fonte da etapa.
--
-- A fonte fica em tabela própria por causa do token: a listagem de
-- `funnel_spreadsheets` é lida também por convidado, e o token é o que autoriza
-- escrever lead na etapa.
CREATE TABLE IF NOT EXISTS webhook_lead_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id uuid NOT NULL REFERENCES funnel_spreadsheets(id) ON DELETE CASCADE,
  stage_id       uuid REFERENCES funnel_stages(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token          varchar(64) NOT NULL,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_lead_source_spreadsheet
  ON webhook_lead_sources (spreadsheet_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_lead_source_token
  ON webhook_lead_sources (token);

-- Append-only, como a planilha seria: o dedup de "únicos" continua na leitura.
CREATE TABLE IF NOT EXISTS webhook_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    uuid NOT NULL REFERENCES webhook_lead_sources(id) ON DELETE CASCADE,
  nome         text,
  email        text,
  telefone     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  payload      jsonb,
  recebido_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_leads_source
  ON webhook_leads (source_id, recebido_em);
