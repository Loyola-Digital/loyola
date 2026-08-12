-- RevenueCat: data para TODO evento + base para o backfill de assinaturas.
--
-- 1) revenuecat_sales.event_at
--    `purchased_at` só existe em evento de compra (vem de `purchased_at_ms`).
--    Os eventos de paywall — hoje 96% do volume recebido — usam
--    `event_timestamp_ms` e ficavam com data NULL, invisíveis pra qualquer
--    leitura por período. `event_at` é o instante do EVENTO, sempre preenchido.
--    `purchased_at` continua com a semântica de compra (a rota de vendas filtra
--    por ele e por tipo de receita — não pode passar a incluir paywall).
--
-- 2) revenuecat_subscriptions
--    Estado das assinaturas lido da API v2. Tabela separada de propósito:
--    `revenuecat_sales` é log de EVENTO (imutável, veio por webhook), enquanto
--    assinatura é ESTADO (muda com o tempo e é relida a cada backfill).
--
-- 3) revenuecat_backfill_state
--    Cursor de retomada. A base tem milhares de clientes e o backfill custa uma
--    chamada por cliente; sem cursor, uma falha no meio obrigaria a recomeçar.

ALTER TABLE revenuecat_sales
  ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;

-- Backfill do que já chegou: o payload cru guarda os dois carimbos, em dois
-- formatos possíveis (envelope {event:{...}} ou objeto do evento na raiz).
UPDATE revenuecat_sales
SET event_at = to_timestamp(
  COALESCE(
    NULLIF(payload -> 'event' ->> 'event_timestamp_ms', '')::bigint,
    NULLIF(payload ->> 'event_timestamp_ms', '')::bigint,
    NULLIF(payload -> 'event' ->> 'purchased_at_ms', '')::bigint,
    NULLIF(payload ->> 'purchased_at_ms', '')::bigint
  ) / 1000.0
)
WHERE event_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_revenuecat_sales_stage_event_at
  ON revenuecat_sales(stage_id, event_at);

CREATE TABLE IF NOT EXISTS revenuecat_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  /* id da assinatura na API v2 do RevenueCat */
  subscription_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255),
  store VARCHAR(30),
  country VARCHAR(8),
  /* will_renew | will_not_renew | ... */
  auto_renewal_status VARCHAR(40),
  status VARCHAR(40),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_period_starts_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  entitlements JSONB,
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenuecat_subscriptions_stage_sub
  ON revenuecat_subscriptions(stage_id, subscription_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_subscriptions_stage_starts
  ON revenuecat_subscriptions(stage_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_revenuecat_subscriptions_customer
  ON revenuecat_subscriptions(stage_id, customer_id);

CREATE TABLE IF NOT EXISTS revenuecat_backfill_state (
  stage_id UUID PRIMARY KEY REFERENCES funnel_stages(id) ON DELETE CASCADE,
  /* idle | running | done | error */
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  /* cursor da paginação de customers na API v2 (starting_after) */
  next_cursor TEXT,
  customers_processed INTEGER NOT NULL DEFAULT 0,
  subscriptions_upserted INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
