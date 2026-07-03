-- Story 37.3 — âncora do comentário no doc do debriefing (estilo Figma).
-- Posição em % da largura/altura do documento; NULL = comentário geral.
-- Puramente aditiva e idempotente.

ALTER TABLE "debriefing_comments" ADD COLUMN IF NOT EXISTS "anchor_x" double precision;
--> statement-breakpoint
ALTER TABLE "debriefing_comments" ADD COLUMN IF NOT EXISTS "anchor_y" double precision;
