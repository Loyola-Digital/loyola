-- Tentativas de contato do vendedor com o participante do evento presencial.
--
-- Pedido do Lucas (30/09/2026): na tela do Mapa, o vendedor abre o lead que já
-- está atribuído a ele e registra "liguei" — e fica o histórico, com o número
-- da tentativa. Hoje a tela só guarda o status final (pendente / negociando /
-- negativa): quem ligou três vezes e não foi atendido aparece igual a quem
-- ninguém tocou, e o vendedor não tem onde consultar o que já tentou.
--
-- Array no próprio lead, não tabela nova: a tela já carrega esta linha inteira
-- para montar o mapa, então o histórico chega sem join nem segunda query, e são
-- poucas tentativas por pessoa. O append é feito em SQL (`contact_attempts ||`),
-- então dois vendedores registrando ao mesmo tempo não se sobrescrevem.
--
-- Idempotente e sem risco: coluna nova com default, nada é reescrito.

ALTER TABLE "stage_event_lead_status"
  ADD COLUMN IF NOT EXISTS "contact_attempts" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Rollback:
-- ALTER TABLE "stage_event_lead_status" DROP COLUMN IF EXISTS "contact_attempts";
