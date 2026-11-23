import { config } from "dotenv";
import { Pool } from "pg";

// A tabela do aviso de venda nova (push por venda que cai na planilha).
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0184_aviso_de_venda_nova.sql:
//   pnpm --filter @loyola-x/api exec tsx migrate-0184.ts
//
// Existe apesar do `drizzle-kit push` do boot: o push para num diálogo
// interativo (ver `runMigrationsOnBoot`) e não aplica nada. Idempotente:
// reexecutar é seguro (CREATE TABLE/INDEX IF NOT EXISTS). Tabela nova e vazia,
// nenhuma linha existente muda.

config();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "sale_push_sent" (
     "stage_id"   uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
     "chave"      text NOT NULL,
     "avisado_em" timestamp with time zone,
     "visto_em"   timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "sale_push_sent_pkey" PRIMARY KEY ("stage_id", "chave")
   );`,
  `CREATE INDEX IF NOT EXISTS "idx_sale_push_sent_avisado" ON "sale_push_sent" ("avisado_em");`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0184.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    const antes = await pool.query(
      `SELECT to_regclass('public.sale_push_sent') IS NOT NULL AS existe;`,
    );
    console.log("Antes — sale_push_sent existe:", antes.rows[0].existe);

    console.log("Aplicando migration 0184 (aviso de venda nova)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }

    const { rows } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'sale_push_sent' ORDER BY ordinal_position;`,
    );
    console.log("Depois — colunas:", rows.map((r) => `${r.column_name}:${r.data_type}`).join(", "));
    const { rows: idx } = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'sale_push_sent' ORDER BY 1;`,
    );
    console.log("Depois — índices:", idx.map((r) => r.indexname).join(", "));
    console.log("Migration 0184 aplicada.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
