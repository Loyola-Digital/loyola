-- SendFlow serve TODOS os experts com a mesma conta, entao a conexao passa a
-- poder ser GLOBAL (project_id NULL). Uma linha global atende qualquer projeto;
-- uma linha com project_id continua valendo como override daquele projeto.
--
-- O UNIQUE antigo era sobre uma coluna NOT NULL. Em Postgres, UNIQUE deixa
-- passar varios NULL — o que permitiria duas conexoes globais. Por isso o
-- indice parcial: no maximo UMA global.
ALTER TABLE "sendflow_connections" ALTER COLUMN "project_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sendflow_global"
  ON "sendflow_connections" ((1)) WHERE "project_id" IS NULL;
