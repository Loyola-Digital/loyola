import { config } from "dotenv";
import { Pool } from "pg";

// Metas do mês de uma conta do Instagram.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0182_metas_do_mes_instagram.sql. Rodar com:
//   pnpm --filter @loyola-x/api exec tsx migrate-0182.ts
//
// Idempotente: reexecutar é seguro (CREATE TABLE IF NOT EXISTS). Tabela nova —
// nenhuma linha existente é tocada.

config();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS instagram_monthly_goals (
     account_id        uuid        NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
     mes               varchar(7)  NOT NULL,
     saldo_seguidores  integer,
     alcance           integer,
     posts             integer,
     metas_por_formato jsonb,
     atualizado_em     timestamptz NOT NULL DEFAULT now(),
     atualizado_por    uuid        REFERENCES users(id) ON DELETE SET NULL,
     PRIMARY KEY (account_id, mes)
   );`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0182.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("Aplicando migration 0182 (metas do mês do Instagram)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'instagram_monthly_goals' ORDER BY ordinal_position;`,
    );
    console.log("Colunas:", rows.map((r) => r.column_name).join(", "));
    console.log("Migration 0182 aplicada.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
