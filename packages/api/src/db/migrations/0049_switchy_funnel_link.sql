-- Story 33.6: Switchy Funnel Association + Account Pixels.
-- Atrela cada shortlink gerado a um FUNIL (funnel_id) — links vivem dentro da
-- página do funil. FK com ON DELETE SET NULL (apagar funil não apaga histórico
-- de links, só desvincula). Idempotente (IF NOT EXISTS / guard de constraint).

ALTER TABLE "switchy_shortened_links"
  ADD COLUMN IF NOT EXISTS "funnel_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'switchy_shortened_links_funnel_id_funnels_id_fk'
      AND table_name = 'switchy_shortened_links'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "switchy_shortened_links"
      ADD CONSTRAINT "switchy_shortened_links_funnel_id_funnels_id_fk"
      FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_switchy_links_funnel" ON "switchy_shortened_links" USING btree ("funnel_id");
