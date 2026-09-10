-- Epic 47 / Story 47.9 — Nome de VSL.
--
-- O nome de uma VSL é `vsl_expert_produto_lead_problema_solucao_oferta`.
-- Expert, produto e oferta são os do dicionário de campanhas (a oferta é o
-- pitch — decisão do dono em 2026-09-10). Lead, mecanismo do problema e
-- mecanismo da solução são as três variáveis próprias da VSL, cadastradas
-- POR EXPERT numa tabela só com `type` — o mesmo desenho de
-- naming_dictionary_values com expert_id a mais.
--
-- ## Regras (as mesmas do dicionário, spec § 3 e § 5)
--
-- Código único por (expert, tipo) INCLUINDO inativos; imutável depois de usado
-- em pelo menos uma VSL salva; descrição obrigatória (é o que se lê no
-- select); exclusão bloqueada quando referenciado → desativar. Toda escrita
-- deixa linha em naming_changelog.
--
-- ## naming_vsls guarda texto além das FKs
--
-- Pelo mesmo motivo de naming_campaigns: o nome continua reconstruível se uma
-- variável for desativada depois. `name` é único — duas VSLs com a mesma
-- combinação são a mesma VSL (não há sufixo nem "publicar").

DO $$ BEGIN
  CREATE TYPE naming_vsl_variable_type AS ENUM ('lead', 'problem', 'solution');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS naming_vsl_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  type naming_vsl_variable_type NOT NULL,
  code varchar(20) NOT NULL,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_vsl_variables_expert_type_code ON naming_vsl_variables (expert_id, type, code);
CREATE INDEX IF NOT EXISTS idx_naming_vsl_variables_expert ON naming_vsl_variables (expert_id);

CREATE TABLE IF NOT EXISTS naming_vsls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES naming_products(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES naming_vsl_variables(id) ON DELETE RESTRICT,
  problem_id uuid NOT NULL REFERENCES naming_vsl_variables(id) ON DELETE RESTRICT,
  solution_id uuid NOT NULL REFERENCES naming_vsl_variables(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES naming_offers(id) ON DELETE RESTRICT,
  lead_value varchar(20) NOT NULL,
  problem_value varchar(20) NOT NULL,
  solution_value varchar(20) NOT NULL,
  offer_value varchar(8) NOT NULL,
  name varchar(160) NOT NULL,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_vsls_name ON naming_vsls (name);
CREATE INDEX IF NOT EXISTS idx_naming_vsls_expert ON naming_vsls (expert_id);
