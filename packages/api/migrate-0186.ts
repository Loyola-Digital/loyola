import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";

// A view `google_ads_conexao_lyrio` (uma linha, cifrada) e o GRANT para o papel
// do espelho — para o painel do Lyrio ler a conexão Google que o Loyola X
// mantém, em vez de carregar o refresh token numa variável de ambiente.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio):
//   pnpm --filter @loyola-x/api exec tsx migrate-0186.ts
//
// Aplica src/db/migrations/0186_conexao_google_do_lyrio.sql.

config();

const ARQUIVO = "src/db/migrations/0186_conexao_google_do_lyrio.sql";

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0186.");
    process.exit(1);
  }

  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(path.join(raiz, ARQUIVO), "utf8");

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    const antes = await pool.query(
      `SELECT to_regclass('public.google_ads_conexao_lyrio') IS NOT NULL AS existe;`,
    );
    console.log("Antes — view existe:", antes.rows[0].existe);

    await pool.query(sql);

    const { rows: linhas } = await pool.query(
      `SELECT customer_id, created_at::date FROM google_ads_conexao_lyrio;`,
    );
    console.log(`Depois — view com ${linhas.length} linha(s):`, linhas);
    const { rows: grant } = await pool.query(
      `SELECT has_table_privilege('lyrio_espelho', 'google_ads_conexao_lyrio', 'SELECT') pode;`,
    );
    console.log("Depois — lyrio_espelho pode ler a view:", grant[0].pode);
    // A conta do Netão não pode aparecer aqui: é o ponto da view.
    const { rows: fora } = await pool.query(
      `SELECT count(*)::int n FROM google_ads_accounts WHERE customer_id <> '4386529178';`,
    );
    console.log(`Depois — ${fora[0].n} conta(s) de outro projeto seguem fora da view.`);
    console.log("Migration 0186 aplicada.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
