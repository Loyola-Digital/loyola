-- Story 18.56: link manual por LP na tabela "Desempenho de Testes de LPs".
-- Chave = lpName normalizado (trim+lowercase), valor = URL http(s).
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "lp_links" jsonb DEFAULT '{}'::jsonb NOT NULL;
