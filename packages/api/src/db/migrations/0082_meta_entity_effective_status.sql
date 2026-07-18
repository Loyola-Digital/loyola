-- Story 18.61: coluna effective_status no cache de entidades Meta.
-- Guarda o estado ATUAL da entidade (ACTIVE, PAUSED, ARCHIVED, CAMPAIGN_PAUSED,
-- ADSET_PAUSED, DISAPPROVED, PENDING_REVIEW, …). Nullable: entradas antigas e
-- entidades sem status resolvido ficam NULL → o dashboard exibe "—", nunca
-- "Pausado" por ausência de dado. Populado pelo backfill diário de nomes.
-- Additive + idempotente (prod não roda drizzle migrate).
ALTER TABLE "meta_entity_names_cache" ADD COLUMN IF NOT EXISTS "effective_status" varchar(40);
