-- Integração VTurb Analytics (VSL).
--
-- `vturb_connections`: token por PROJETO — uma conta VTurb serve todos os funis
-- do cliente. Criptografado no mesmo padrão das outras integrações (AES + IV
-- separado), nunca em texto puro.
--
-- `vturb_players`: vincula um player (VSL) a uma ETAPA do funil. Guarda
-- `duration` e `pitch_time` porque a API do VTurb EXIGE os dois como parâmetro
-- na maioria dos endpoints de stats — sem eles não dá pra calcular engajamento
-- nem retenção no pitch. Vêm de /players/list e ficam cacheados aqui pra não
-- precisar listar tudo a cada consulta.
--
-- Idempotente — prod não roda drizzle migrate.
CREATE TABLE IF NOT EXISTS "vturb_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "api_token_encrypted" text NOT NULL,
  "api_token_iv" text NOT NULL,
  -- Fuso enviado à API. O VTurb assume UTC quando omitido, e aí o corte de dia
  -- sai errado pra quem opera no Brasil.
  "timezone" varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vturb_players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  -- ID do player no VTurb (UUID deles).
  "player_id" varchar(64) NOT NULL,
  "player_name" text NOT NULL,
  -- Segundos. Obrigatórios nos endpoints de stats do VTurb.
  "duration" integer,
  "pitch_time" integer,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Mesmo player não pode ser vinculado duas vezes à mesma etapa.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vturb_players_stage_player"
  ON "vturb_players" ("stage_id", "player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vturb_players_stage" ON "vturb_players" ("stage_id");
