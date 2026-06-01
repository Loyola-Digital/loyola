import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0043_funnels_archived.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0043 applied (funnels.archived_at, archived_by)');

  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'funnels' AND column_name IN ('archived_at','archived_by')
     ORDER BY column_name`,
  );
  console.log('\narchive columns:', cols.rows);

  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'funnels' ORDER BY indexname`,
  );
  console.log('\nindexes:', idx.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
