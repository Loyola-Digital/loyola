-- Devolver ao Meta a FAIXA de cada lead — a volta que fecha o ciclo.
--
-- Pedido do Lucas (02/10/2026): "todo motor dentro do loyola x, pra lá ficar
-- configurável por campanha qual lead eu quero enviar retorno pra meta, tipo
-- faixa A enviar pra meta ele e a faixa dele".
--
-- O Meta otimiza para "lead", e lead é qualquer formulário preenchido — então
-- persegue o mais barato, que costuma ser o pior. Mandando de volta um evento só
-- para a faixa que importa, o algoritmo passa a perseguir ESSE.
--
-- `stage_lead_capi_enviados` guarda o HASH do identificador, nunca o e-mail: o
-- dedup funciona igual e nenhum dado pessoal novo entra no banco por causa
-- desta feature.

CREATE TABLE IF NOT EXISTS "stage_lead_capi" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL UNIQUE REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "dataset_id" varchar(50) NOT NULL,
  "meta_account_id" uuid REFERENCES "meta_ads_accounts"("id") ON DELETE SET NULL,
  "event_name" varchar(60) NOT NULL DEFAULT 'LeadQualificado',
  "bands" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "test_event_code" varchar(40),
  "ativo" boolean NOT NULL DEFAULT false,
  "ultimo_envio_em" timestamptz,
  "ultimo_resultado" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stage_lead_capi_enviados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "lead_hash" varchar(64) NOT NULL,
  "faixa" varchar(10) NOT NULL,
  "enviado_em" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_lead_capi_enviado"
  ON "stage_lead_capi_enviados" ("stage_id", "lead_hash");
CREATE INDEX IF NOT EXISTS "idx_lead_capi_enviado_stage"
  ON "stage_lead_capi_enviados" ("stage_id");

-- Rollback:
-- DROP TABLE IF EXISTS "stage_lead_capi_enviados";
-- DROP TABLE IF EXISTS "stage_lead_capi";
