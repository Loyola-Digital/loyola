-- Story 29.37 — tetos por variável, com procedência.
--
-- O teto é INPUT, não inferência (CEIL-01). O protocolo é explícito sobre o
-- que NÃO serve como fonte: estimativa do analista, média de mercado sem
-- referência, extrapolação da tendência. Um teto inventado contamina o ranking
-- inteiro, porque é dele que sai a ordem de prioridade.
--
-- Forma de `ceilings`:
--   {
--     "play_rate": {
--       "value": 0.85,
--       "source": "melhor_historico",
--       "note": "melhor semana de junho/2026"
--     }
--   }
--
-- `source` aceita só os 4 valores que o protocolo autoriza:
--   benchmark_outro_funil | melhor_historico | benchmark_fonte | teto_fisico
--
-- Variável sem teto com procedência sai UNKNOWN e NAO entra no ranking -- o
-- que e diferente de nao ter potencial: e nao sabermos qual e.
--
-- Additive + idempotente (prod não roda drizzle migrate).

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "ceilings" jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN "perpetual_report_configs"."ceilings" IS
  'Teto por variavel, com procedencia. Chave = key da etapa. source aceita apenas benchmark_outro_funil, melhor_historico, benchmark_fonte ou teto_fisico -- CEIL-01 rejeita estimativa e extrapolacao.';

-- Rollback:
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "ceilings";
