-- A chave da API do Tally, por projeto.
--
-- Pedido do Lucas (02/10/2026): o Lead Scoring é montado hoje num fluxo do n8n
-- ("ta foda, n ta legal lá") e colado na aba como JSON. Com a chave aqui, o
-- Loyola X lê o formulário direto do Tally e transcreve as perguntas e as
-- alternativas sozinho — sobra para quem monta só a parte que exige conhecer o
-- negócio, que é a pontuação.
--
-- O token fica cifrado (mesmo esquema do SendFlow) e nunca volta para a tela.
-- Um projeto, uma conta: `project_id` é único.

CREATE TABLE IF NOT EXISTS "tally_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "token_encrypted" text NOT NULL,
  "token_iv" varchar(64) NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Rollback:
-- DROP TABLE IF EXISTS "tally_connections";
