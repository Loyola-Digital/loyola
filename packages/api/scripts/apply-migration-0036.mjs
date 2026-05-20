import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0036_meta_insights_daily_cache.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0036 applied (meta_campaign_insights_daily + meta_ad_insights_daily)');

  for (const table of ['meta_campaign_insights_daily', 'meta_ad_insights_daily']) {
    const cols = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    console.log(`\n${table} columns:`, cols.rows);

    const idx = await client.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY indexname`,
      [table],
    );
    console.log(`${table} indexes:`, idx.rows);
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
