-- Um evento do Meta POR FAIXA, em vez de um só com a faixa no corpo.
--
-- Pedido do Lucas (07/10/2026): "quero enviar vários eventos pra Meta, tipo
-- Faixa A enviar leads faixa A, faixa B os faixa B".
--
-- É o que faz a feature valer: o Meta otimiza para UM evento. Com um nome só,
-- a campanha que mira lead A e a que mira lead B aprenderiam a mesma coisa —
-- não haveria o que escolher no Gerenciador. Com um evento por faixa, cada
-- campanha persegue a sua.
--
-- `eventos_por_faixa` é o nome escolhido de cada faixa; faixa ausente cai no
-- padrão `${event_name}${faixa}`.
--
-- O controle de enviados passa a incluir o evento na chave única: trocar o nome
-- permite reenviar o mesmo lead sob o nome novo. Sem isso, o evento novo
-- nasceria sem histórico — o pior momento para o algoritmo aprender.
--
-- Sem risco: nada foi enviado ainda (a feature nasce desligada e nenhuma etapa
-- tem `ativo = true`), então a tabela de enviados está vazia.

ALTER TABLE "stage_lead_capi"
  ADD COLUMN IF NOT EXISTS "eventos_por_faixa" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "stage_lead_capi_enviados"
  ADD COLUMN IF NOT EXISTS "event_name" varchar(60) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "uq_lead_capi_enviado";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lead_capi_enviado"
  ON "stage_lead_capi_enviados" ("stage_id", "lead_hash", "event_name");

-- Rollback:
-- DROP INDEX IF EXISTS "uq_lead_capi_enviado";
-- CREATE UNIQUE INDEX "uq_lead_capi_enviado" ON "stage_lead_capi_enviados" ("stage_id", "lead_hash");
-- ALTER TABLE "stage_lead_capi_enviados" DROP COLUMN IF EXISTS "event_name";
-- ALTER TABLE "stage_lead_capi" DROP COLUMN IF EXISTS "eventos_por_faixa";
