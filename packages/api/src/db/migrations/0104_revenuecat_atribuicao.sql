-- Story 42.6 — atribuição do RevenueCat em coluna.
--
-- O webhook sempre entregou UTM em `event.subscriber_attributes` e o corpo
-- inteiro já era gravado em `payload` (jsonb). Estas colunas não trazem dado
-- novo: tornam legível o que estava enterrado, para leitura por período e
-- cruzamento com as entidades da Meta sem varrer jsonb.
--
-- Aditiva e idempotente. Aplicar via
-- src/scripts/apply-revenuecat-atribuicao-migration.ts (não usar drizzle-kit
-- push) — o mesmo script faz o backfill dos eventos já recebidos.
--
-- PII NÃO entra aqui: $email, $phoneNumber, $displayName, $ip, $idfa, $idfv,
-- $gpsAdId e $fbAnonId seguem apenas no payload.

ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "utm_source" varchar(255);
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "utm_medium" varchar(255);
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "utm_campaign" varchar(255);
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "utm_term" varchar(255);
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "utm_content" varchar(255);
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "gclid" text;
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "fbclid" text;
--> statement-breakpoint
ALTER TABLE "revenuecat_sales" ADD COLUMN IF NOT EXISTS "acquisition_source" varchar(64);
--> statement-breakpoint
-- Chaves de cruzamento com campanha e anúncio da Meta (Story 42.7).
CREATE INDEX IF NOT EXISTS "idx_revenuecat_sales_stage_utm_campaign"
  ON "revenuecat_sales" ("stage_id", "utm_campaign");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_sales_stage_utm_content"
  ON "revenuecat_sales" ("stage_id", "utm_content");
