-- Conexão com o SendFlow (WhatsApp) por projeto.
--
-- O servidor MCP do SendFlow só aceita `authorization_code` + `refresh_token` —
-- NÃO tem `client_credentials`. Então não existe caminho máquina-a-máquina:
-- alguém autoriza uma vez no navegador e o que sobra é o refresh_token, que o
-- backend usa pra renovar o access_token sozinho daí em diante.
--
-- Por isso guardamos client_id/secret também: o refresh exige os dois.
CREATE TABLE IF NOT EXISTS "sendflow_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "client_id" varchar(255) NOT NULL,
  "client_secret_encrypted" text NOT NULL,
  "client_secret_iv" varchar(64) NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "refresh_token_iv" varchar(64) NOT NULL,
  -- Cache do access_token: dura 1h e renovar a cada request queimaria rate limit.
  "access_token_encrypted" text,
  "access_token_iv" varchar(64),
  "access_token_expires_at" timestamptz,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
