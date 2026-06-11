/**
 * Runner de migration manual (padrão do projeto: node + pg).
 * Uso: node scripts/run-migration.mjs <arquivo.sql>
 * Aplica cada statement separado por `--> statement-breakpoint`.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/run-migration.mjs <arquivo.sql>');
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), file);
const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = sql
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  console.log(`Aplicando ${statements.length} statement(s) de ${path.basename(sqlPath)}...`);
  for (const [i, stmt] of statements.entries()) {
    await client.query(stmt);
    console.log(`  [${i + 1}/${statements.length}] OK`);
  }
  console.log('Migration aplicada com sucesso.');
} catch (err) {
  console.error('Falha na migration:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
