-- Etapa "redirect": o anúncio manda direto para o grupo de WhatsApp, sem
-- captação de lead no meio. A etapa guarda quais campanhas do SendFlow
-- (releases) ela observa — é por campanha, e não por grupo, porque só a
-- campanha tem série diária de entradas/saídas no SendFlow.
--
-- Mesmo formato de `campaigns` (Meta) e `google_ads_campaigns`: [{id, name}].
ALTER TABLE funnel_stages
  ADD COLUMN IF NOT EXISTS sendflow_releases jsonb NOT NULL DEFAULT '[]'::jsonb;
