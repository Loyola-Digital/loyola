import { config } from "dotenv";
import { Pool } from "pg";

// As três frases e o plano do mês, na linha das metas do Instagram.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0183_relatorio_do_mes_instagram.sql:
//   pnpm --filter @loyola-x/api exec tsx migrate-0183.ts
//
// Idempotente: reexecutar é seguro (ADD COLUMN IF NOT EXISTS). Aditiva,
// nullable e sem default — nenhuma linha existente muda.

config();

const STATEMENTS: string[] = [
  `ALTER TABLE "instagram_monthly_goals"
     ADD COLUMN IF NOT EXISTS "resumo_onde_estamos" text,
     ADD COLUMN IF NOT EXISTS "resumo_aprendizado"  text,
     ADD COLUMN IF NOT EXISTS "resumo_prioridade"   text,
     ADD COLUMN IF NOT EXISTS "plano"               jsonb;`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0183.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("Aplicando migration 0183 (relatório do mês do Instagram)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'instagram_monthly_goals' ORDER BY ordinal_position;`,
    );
    console.log("Colunas:", rows.map((r) => r.column_name).join(", "));
    console.log("Migration 0183 aplicada.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
