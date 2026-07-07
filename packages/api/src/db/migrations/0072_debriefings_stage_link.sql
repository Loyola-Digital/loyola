-- Debriefing vira etapa de funil (stageType "debriefing"): cada debriefing
-- pode pertencer a uma etapa. Os antigos (globais) ficam com stage_id NULL e a
-- view da etapa oferece "trazer pra esta etapa". ON DELETE SET NULL: excluir a
-- etapa NÃO apaga os docs (voltam a ficar sem etapa). Aditiva e idempotente.

ALTER TABLE "debriefings" ADD COLUMN IF NOT EXISTS "stage_id" uuid REFERENCES "funnel_stages"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_debriefings_stage" ON "debriefings" ("stage_id");
