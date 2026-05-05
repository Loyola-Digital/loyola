-- Migration: add column_mapping to funnel_surveys
-- Motivo: as perguntas e UTMs eram hardcoded em packages/web/lib/constants/survey-questions.ts
-- com matchers de texto fixo, funcionando so para o projeto cuja planilha tem essas
-- perguntas exatas. Esta migration permite mapear colunas dinamicamente por survey:
-- quais sao as UTMs (source/medium/campaign/content), email, phone, timestamp e
-- quais colunas sao perguntas exibidas no dashboard com label customizavel.

ALTER TABLE funnel_surveys
ADD COLUMN column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Comentario na coluna pra documentar o shape esperado:
-- {
--   utm_source?: string,        -- nome da coluna na planilha
--   utm_medium?: string,
--   utm_campaign?: string,
--   utm_content?: string,
--   email?: string,
--   phone?: string,
--   timestamp?: string,
--   questions?: Array<{ columnName: string, label: string, showInDashboard: boolean }>
-- }
COMMENT ON COLUMN funnel_surveys.column_mapping IS
  'Mapping de colunas da planilha: utm_source, utm_medium, utm_campaign, utm_content, email, phone, timestamp e questions (array de perguntas com label customizado).';
