-- Atribuição de vendedor a um lead na etapa de Evento Presencial. O vendedor é
-- um closer cadastrado na etapa (nome livre, espelha stage_event_closers).
-- Coluna nullable pra não quebrar linhas existentes. Aditiva e idempotente.

ALTER TABLE "stage_event_lead_status" ADD COLUMN IF NOT EXISTS "assigned_seller" varchar(255);
