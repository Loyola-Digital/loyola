import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const r = await client.query(
    `SELECT id, stage_id, subtype, spreadsheet_name, sheet_name, column_mapping
     FROM stage_sales_spreadsheets
     ORDER BY created_at DESC
     LIMIT 10`,
  );
  console.log(`Últimas ${r.rows.length} planilhas de venda:\n`);
  for (const row of r.rows) {
    console.log(`→ ${row.id}`);
    console.log(`  stage_id: ${row.stage_id}`);
    console.log(`  subtype: ${row.subtype}`);
    console.log(`  spreadsheet_name: ${row.spreadsheet_name}`);
    console.log(`  sheet_name: ${row.sheet_name}`);
    console.log(`  column_mapping keys: [${Object.keys(row.column_mapping ?? {}).join(', ')}]`);
    console.log(`  column_mapping.productName: ${JSON.stringify(row.column_mapping?.productName ?? null)}`);
    console.log(`  column_mapping.customerName: ${JSON.stringify(row.column_mapping?.customerName ?? null)}`);
    console.log(`  column_mapping completo:`, JSON.stringify(row.column_mapping, null, 2));
    console.log('');
  }
} catch (e) {
  console.error(e);
} finally {
  await client.end();
}
