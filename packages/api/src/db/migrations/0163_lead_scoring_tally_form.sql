-- O formulário do Tally como fonte das RESPOSTAS do Lead Scoring.
--
-- Preenchido, o motor lê a API do Tally; vazio, lê a planilha do Google como
-- sempre leu. As duas convivem de propósito: etapa antiga segue na planilha,
-- etapa nova nasce no Tally, e ninguém precisa migrar tudo de uma vez.

ALTER TABLE "stage_lead_scoring_schemas"
  ADD COLUMN IF NOT EXISTS "tally_form_id" varchar(100);

-- Rollback:
-- ALTER TABLE "stage_lead_scoring_schemas" DROP COLUMN IF EXISTS "tally_form_id";
