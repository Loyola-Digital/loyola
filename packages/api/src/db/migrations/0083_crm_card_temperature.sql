-- Badge de perfil hot/cold no card do CRM (etapa Comercial). Temperatura vem
-- da utm_term da venda (hot/quente vs cold/frio). null = sem track.
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "stage_crm_cards" ADD COLUMN IF NOT EXISTS "temperature" varchar(10);
