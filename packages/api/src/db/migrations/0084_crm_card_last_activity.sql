-- "Última movimentação/edição" do card do CRM (etapa Comercial). Bumpado só em
-- ações manuais (mover no kanban / editar card), não no sync. null = sem ação.
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "stage_crm_cards" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone;
