-- Epic 47 / Story 47.1 — dicionário da nomenclatura de campanhas do perpétuo.
--
-- O nome de cada campanha no Meta segue nove campos separados por `_`
-- (`bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa`). Ele viaja na URL, chega
-- na planilha de vendas e é quebrado em nove colunas para cruzar investimento
-- com faturamento. Estas tabelas são de onde cada campo sai.
--
-- ## `naming_` na frente
--
-- `funnels` e `projects` já existem e são o funil-etapa do Loyola X; `campaigns`
-- é coluna jsonb de `funnels`. O prefixo segue `swipe_*`, `planner_*`, `stage_*`.
--
-- ## UNIQUE sem `WHERE active`
--
-- Regra 4 da spec: código nunca muda de significado nem é reaproveitado.
-- `of02` desativada continua sendo "a oferta de R$ 297" para sempre.
--
-- ## `ON DELETE RESTRICT`
--
-- Quem decide apagar é o serviço, que precisa listar o que referencia para a
-- tela oferecer "Desativar" no lugar. Cascata apagaria em silêncio.
--
-- ## `naming_campaigns` guarda texto além das FKs
--
-- `year`, `temperature`, `auction`, `format`, `offer_value`, `lp_value` são o
-- texto que entrou no nome; `ofmix`, `lpmix` e `na` nem são registros.

DO $$ BEGIN
  CREATE TYPE naming_dictionary_type AS ENUM ('year', 'temperature', 'auction', 'format');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE naming_changelog_action AS ENUM ('create', 'update', 'delete', 'deactivate', 'reactivate', 'publish');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS naming_experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(4) NOT NULL,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_experts_code ON naming_experts (code);

CREATE TABLE IF NOT EXISTS naming_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  slug varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_products_expert_slug ON naming_products (expert_id, slug);
CREATE INDEX IF NOT EXISTS idx_naming_products_expert ON naming_products (expert_id);

CREATE TABLE IF NOT EXISTS naming_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  code varchar(3) NOT NULL,
  description text NOT NULL,
  started_at date NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_funnels_expert_code ON naming_funnels (expert_id, code);
CREATE INDEX IF NOT EXISTS idx_naming_funnels_expert ON naming_funnels (expert_id);

CREATE TABLE IF NOT EXISTS naming_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  code varchar(4) NOT NULL,
  description text NOT NULL,
  started_at date NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_offers_expert_code ON naming_offers (expert_id, code);
CREATE INDEX IF NOT EXISTS idx_naming_offers_expert ON naming_offers (expert_id);

CREATE TABLE IF NOT EXISTS naming_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES naming_products(id) ON DELETE RESTRICT,
  funnel_id uuid NOT NULL REFERENCES naming_funnels(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES naming_offers(id) ON DELETE RESTRICT,
  code varchar(3) NOT NULL,
  slug varchar(80) NOT NULL,
  url text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_lps_combinacao_code
  ON naming_landing_pages (expert_id, product_id, funnel_id, offer_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_lps_slug ON naming_landing_pages (slug);
CREATE INDEX IF NOT EXISTS idx_naming_lps_expert ON naming_landing_pages (expert_id);

CREATE TABLE IF NOT EXISTS naming_dictionary_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type naming_dictionary_type NOT NULL,
  value varchar(20) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_dictionary_type_value ON naming_dictionary_values (type, value);

CREATE TABLE IF NOT EXISTS naming_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES naming_products(id) ON DELETE RESTRICT,
  funnel_id uuid NOT NULL REFERENCES naming_funnels(id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES naming_offers(id) ON DELETE RESTRICT,
  offer_value varchar(8) NOT NULL,
  year varchar(20) NOT NULL,
  temperature varchar(20) NOT NULL,
  auction varchar(20) NOT NULL,
  format varchar(20) NOT NULL,
  landing_page_id uuid REFERENCES naming_landing_pages(id) ON DELETE RESTRICT,
  lp_value varchar(8) NOT NULL,
  suffix varchar(3),
  name varchar(160) NOT NULL,
  published_at timestamptz,
  meta_campaign_id varchar(40),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_naming_campaigns_expert ON naming_campaigns (expert_id);
CREATE INDEX IF NOT EXISTS idx_naming_campaigns_name ON naming_campaigns (name);

-- Toda escrita em qualquer tabela naming_* deixa uma linha aqui (regra 7).
CREATE TABLE IF NOT EXISTS naming_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity varchar(40) NOT NULL,
  entity_id uuid NOT NULL,
  action naming_changelog_action NOT NULL,
  "before" jsonb,
  "after" jsonb,
  author uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_naming_changelog_entity ON naming_changelog (entity, entity_id);
