import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Missing DATABASE_URL'); process.exit(1); }

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0062_stage_event_lead_status.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0062 applied');
  const t = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='stage_event_lead_status'`);
  console.log('Tabela:', t.rows.map((r) => r.table_name));
  const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='stage_event_lead_status' ORDER BY indexname`);
  console.log('Índices:', idx.rows.map((r) => r.indexname));
  const fks = await client.query(`SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY' AND table_name='stage_event_lead_status'`);
  console.log('FKs:', fks.rows.map((r) => r.constraint_name));
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
