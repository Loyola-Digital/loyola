-- A página do formulário, junto com o evento que vai ao Meta.
--
-- ## Por que o evento precisa de URL
--
-- O Meta exige `event_source_url` nos eventos de site, e a Qualidade da
-- Correspondência — a nota que o Gerenciador mostra por evento — só é calculada
-- para evento de SITE. Mandando `action_source: system_generated` sem URL, como
-- vinha indo, o evento casa pior e não recebe nota nenhuma.
--
-- Com a URL preenchida, o evento passa a sair como `website` apontando para a
-- página onde a pessoa de fato respondeu o formulário. Vazio, segue
-- `system_generated` sem URL, como antes — nunca "website" sem página, que
-- seria mentir sobre a origem.

ALTER TABLE "stage_lead_capi"
  ADD COLUMN IF NOT EXISTS "event_source_url" text;

-- Rollback:
-- ALTER TABLE "stage_lead_capi" DROP COLUMN IF EXISTS "event_source_url";
