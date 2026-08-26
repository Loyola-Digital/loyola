-- Painel Pessoal (RH): ficha da pessoa, férias e ausências.
--
-- A ficha é 1:1 com `users` — quem trabalha aqui já tem conta, e uma tabela
-- separada de pessoas criaria dois cadastros para o mesmo ser humano.

DO $$ BEGIN
  CREATE TYPE "absence_kind" AS ENUM ('ferias', 'folga', 'ausencia', 'licenca');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "absence_status" AS ENUM ('programada', 'aprovada', 'concluida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "people_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "nome_completo" text,
  "foto" text,
  "nascimento" date,
  "telefone" varchar(40),
  "email_contato" varchar(255),
  "emergencia_nome" varchar(255),
  "emergencia_telefone" varchar(40),
  "emergencia_parentesco" varchar(80),
  "cargo" varchar(120),
  "entrada_em" date,
  "ajuste_saldo_dias" integer DEFAULT 0 NOT NULL,
  "observacoes" text,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- A foto é data: URI. O teto existe porque o campo é texto livre: sem ele,
  -- um upload sem redimensionar viraria uma linha de vários MB que a listagem
  -- carrega inteira toda vez que alguém abre o painel.
  CONSTRAINT "ck_people_records_foto" CHECK ("foto" IS NULL OR length("foto") <= 800000)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "people_absences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" "absence_kind" DEFAULT 'ferias' NOT NULL,
  "status" "absence_status" DEFAULT 'programada' NOT NULL,
  "inicio" date NOT NULL,
  "fim" date NOT NULL,
  "cobertura_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "observacao" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Período invertido é erro de digitação, não dado: barrado na entrada, senão
  -- vira contagem de dias negativa no saldo de férias.
  CONSTRAINT "ck_people_absences_periodo" CHECK ("fim" >= "inicio")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_people_absences_user" ON "people_absences" ("user_id", "inicio");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_people_absences_periodo" ON "people_absences" ("inicio", "fim");
