import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0040_sprint_dashboard_config.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0040 applied (sprint_dashboard_config table)');

  const cols = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'sprint_dashboard_config'
     ORDER BY ordinal_position`,
  );
  console.log('\nsprint_dashboard_config columns:', cols.rows);

  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'sprint_dashboard_config' ORDER BY indexname`,
  );
  console.log('indexes:', idx.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
