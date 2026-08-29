-- Regras de atribuição de origem para aplicações sem `utm_source`.
--
-- A aplicação vive na planilha e é lida a cada request — não há linha no banco
-- para gravar a origem recuperada. Por isso a atribuição é uma REGRA aplicada
-- na leitura: vale para o passado e para o lead novo que cair no mesmo padrão,
-- e a planilha nunca é tocada.

DO $$ BEGIN
  CREATE TYPE "source_rule_operator" AS ENUM ('igual', 'contem', 'comeca_com', 'vazio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stage_source_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE cascade,
  "campo" varchar(120) NOT NULL,
  "operador" "source_rule_operator" DEFAULT 'igual' NOT NULL,
  "valor" text DEFAULT '' NOT NULL,
  "origem" varchar(120) NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- A origem carrega a classificação pago/orgânico no próprio nome; vazia, ela
  -- não classificaria nada e a regra seria um no-op silencioso.
  CONSTRAINT "ck_stage_source_rules_origem" CHECK (length(btrim("origem")) > 0),
  -- Todo operador precisa de valor, menos `vazio` — que casa justamente a
  -- ausência de conteúdo na coluna.
  CONSTRAINT "ck_stage_source_rules_valor"
    CHECK ("operador" = 'vazio' OR length(btrim("valor")) > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_stage_source_rules_stage"
  ON "stage_source_rules" ("stage_id", "ordem");
