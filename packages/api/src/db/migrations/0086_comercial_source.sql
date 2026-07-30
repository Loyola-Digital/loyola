-- Etapa Comercial (CRM): fonte dos cards — "buyers" (quem comprou) ou
-- "survey" (quem respondeu a pesquisa da etapa-fonte).
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "stage_comercial_config" ADD COLUMN IF NOT EXISTS "comercial_source" varchar(20) NOT NULL DEFAULT 'buyers';
