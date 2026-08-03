-- Etapa Comercial (CRM): lead lançado à mão pode não ter e-mail — mesmo padrão
-- de `manual_sales`, onde o obrigatório é o nome. Antes o card exigia e-mail
-- porque toda a origem era importada (planilha/sync), e lá o e-mail é a chave.
--
-- Não perde dado: o DROP NOT NULL só afrouxa, e o índice único novo é mais
-- permissivo que o antigo (mesma coluna, ignorando NULL). Idempotente — prod
-- não roda drizzle migrate.
ALTER TABLE "stage_crm_cards" ALTER COLUMN "customer_email" DROP NOT NULL;
--> statement-breakpoint
-- Unicidade (stage, email) continua valendo para quem TEM e-mail, para o sync
-- seguir fazendo merge em vez de duplicar. Vários cards sem e-mail coexistem
-- porque NULL não colide num índice parcial.
DROP INDEX IF EXISTS "uq_crm_cards_stage_email";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_cards_stage_email" ON "stage_crm_cards" ("stage_id", "customer_email") WHERE "customer_email" IS NOT NULL;
