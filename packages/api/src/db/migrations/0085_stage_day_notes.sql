-- Controle Diário (Meta Ads TESTE): observação de texto livre por dia na etapa.
-- Chave = data YYYY-MM-DD, valor = texto da observação.
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "day_notes" jsonb DEFAULT '{}'::jsonb NOT NULL;
