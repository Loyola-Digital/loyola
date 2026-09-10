-- Epic 47 / Story 47.5 — classificação de campanhas legadas do perpétuo.
--
-- As campanhas que já rodaram no Meta têm nome fora do padrão e não vão ser
-- renomeadas (o Meta congela o nome). Para o cruzamento investimento ×
-- faturamento somar o histórico junto com as campanhas novas, cada uma delas
-- vira uma linha em naming_campaigns ligada pelo id do Meta — a mesma chave que
-- o gasto e a atribuição de venda já usam.
--
-- ## Expert vem do projeto
--
-- As legadas pertencem a projetos (BBE, PP, FZ, DG). Ligar o expert ao projeto
-- deduz o expert sem escolha manual — escolha manual faria o cruzamento por
-- projeto divergir. Único: um projeto, no máximo um expert.
--
-- ## Decisões
--
-- "classificada" aponta para a linha criada; "ignorada" é "não é perpétuo" e é
-- reversível. É o que tira a campanha da fila.

ALTER TABLE naming_experts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_experts_project ON naming_experts (project_id);

DO $$ BEGIN
  CREATE TYPE naming_campaign_origin AS ENUM ('gerador', 'legado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE naming_legacy_decision AS ENUM ('classificada', 'ignorada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE naming_campaigns ADD COLUMN IF NOT EXISTS origin naming_campaign_origin NOT NULL DEFAULT 'gerador';
ALTER TABLE naming_campaigns ADD COLUMN IF NOT EXISTS meta_campaign_name varchar(500);
CREATE INDEX IF NOT EXISTS idx_naming_campaigns_meta ON naming_campaigns (meta_campaign_id);

CREATE TABLE IF NOT EXISTS naming_legacy_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id varchar(64) NOT NULL,
  decision naming_legacy_decision NOT NULL,
  naming_campaign_id uuid REFERENCES naming_campaigns(id) ON DELETE SET NULL,
  reason text,
  author uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_legacy_decisions_campanha ON naming_legacy_decisions (project_id, campaign_id);
