import { config } from "dotenv";
import { Pool } from "pg";

// Tema do conteúdo em cada post do Instagram.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0181_tema_do_post_instagram.sql. Rodar com:
//   pnpm --filter @loyola-x/api exec tsx migrate-0181.ts
//
// Idempotente: reexecutar é seguro (ADD COLUMN IF NOT EXISTS). Aditiva, nullable
// e sem default — nenhuma linha existente muda.

config();

const STATEMENTS: string[] = [
  `ALTER TABLE "instagram_post_metrics"
     ADD COLUMN IF NOT EXISTS "tema"       varchar(60),
     ADD COLUMN IF NOT EXISTS "tema_fonte" varchar(10),
     ADD COLUMN IF NOT EXISTS "tema_por"   uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS "tema_em"    timestamptz;`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0181.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("Aplicando migration 0181 (tema do post do Instagram)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'instagram_post_metrics' AND column_name LIKE 'tema%'
        ORDER BY column_name;`,
    );
    console.log("Colunas presentes:", rows.map((r) => r.column_name).join(", "));
    console.log("Migration 0181 aplicada.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
