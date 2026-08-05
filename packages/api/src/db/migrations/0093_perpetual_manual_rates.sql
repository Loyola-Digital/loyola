-- Story 29.36 — taxas de conversão digitadas à mão, com proveniência.
--
-- O perpétuo não tem VSL instrumentada: play rate, retenção ao pitch e
-- conversão pós-pitch não existem em lugar nenhum do sistema. Até haver
-- integração (VTurb), entram por digitação.
--
-- Um número digitado NÃO é só um número. `AGG-01`/`ST-07` exigem que todas as
-- taxas de uma cadeia venham da MESMA janela — um play rate de janeiro
-- multiplicado por um CTR de ontem produz resultado sem significado. Por isso
-- cada entrada guarda a janela de medição, e não só o valor.
--
-- Forma de `manual_rates`:
--   {
--     "play_rate": {
--       "value": 0.60,
--       "source": "VTurb — plays únicos ÷ pageviews",
--       "windowStart": "2026-07-01",
--       "windowEnd": "2026-07-31",
--       "measuredAt": "2026-08-01T10:00:00Z"
--     }
--   }
--
-- JSONB e não tabela própria: a chave da etapa varia com a arquitetura
-- escolhida (7 templates, conjuntos diferentes de etapas), então uma coluna
-- por etapa exigiria migration a cada template novo.
--
-- Additive + idempotente (prod não roda drizzle migrate).

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "manual_rates" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "funnel_architecture" varchar(40);

ALTER TABLE "perpetual_report_configs"
  ADD COLUMN IF NOT EXISTS "chain_defect_reading" varchar(120);

COMMENT ON COLUMN "perpetual_report_configs"."manual_rates" IS
  'Taxas digitadas por etapa, com proveniencia. Chave = key da etapa no template. Cada valor traz value, source, windowStart, windowEnd, measuredAt -- a janela e obrigatoria porque cadeia com janelas diferentes nao tem significado (AGG-01).';

COMMENT ON COLUMN "perpetual_report_configs"."funnel_architecture" IS
  'Qual dos 7 templates do protocolo descreve este funil. NULL = nao declarado, e a cadeia nao e calculada -- o protocolo proibe adivinhar a arquitetura.';

COMMENT ON COLUMN "perpetual_report_configs"."chain_defect_reading" IS
  'So para sales_page, que tem chain_defect declarado no protocolo: qual leitura o gestor escolheu para a etapa ambigua entre clique no CTA e checkout iniciado.';

-- Rollback:
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "manual_rates";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "funnel_architecture";
--   ALTER TABLE "perpetual_report_configs" DROP COLUMN IF EXISTS "chain_defect_reading";
