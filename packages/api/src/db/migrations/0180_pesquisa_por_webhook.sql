-- Respostas de pesquisa chegando por webhook (n8n, formulário próprio, o que
-- for) em vez da planilha do Tally.
--
-- A fonte é a própria linha de `funnel_surveys`: `spreadsheet_id` guarda
-- `webhook-pesquisa:<id da pesquisa>` e o token autoriza o POST. Não há tabela
-- de fonte como a dos leads porque lá a fonte precisava representar uma
-- planilha virtual; aqui a pesquisa já é a linha.
ALTER TABLE funnel_surveys
  ADD COLUMN IF NOT EXISTS webhook_token varchar(64);

-- Só o corpo cru: as colunas são as perguntas de quem envia, e elas mudam a
-- cada lançamento — uma coluna por pergunta seria uma migration por formulário.
CREATE TABLE IF NOT EXISTS webhook_survey_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   uuid NOT NULL REFERENCES funnel_surveys(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_survey_responses_survey
  ON webhook_survey_responses (survey_id, recebido_em);
