import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0039_funnels_leads_goal.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0039 applied (funnels.leads_goal_meta + leads_goal_data_final)');

  const cols = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'funnels' AND column_name IN ('leads_goal_meta', 'leads_goal_data_final')
     ORDER BY column_name`,
  );
  console.log('\nfunnels columns:', cols.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
