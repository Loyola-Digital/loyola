// Debug pontual (read-only): imprime os cabeçalhos da planilha perpetual_sales
// de um funil, pra conferir nomes reais de colunas (ex.: Produto). Uso:
//   tsx src/scripts/debug-sheet-headers.ts <funnelId>
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const funnelId = process.argv[2];
  if (!funnelId) throw new Error("uso: tsx debug-sheet-headers.ts <funnelId>");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const [sheet] = await db
    .select()
    .from(schema.funnelSpreadsheets)
    .where(and(eq(schema.funnelSpreadsheets.funnelId, funnelId), eq(schema.funnelSpreadsheets.type, "perpetual_sales")))
    .limit(1);
  if (!sheet) throw new Error("sem perpetual_sales nesse funil");
  const data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
  console.log("sheet:", sheet.sheetName);
  data.headers.forEach((h, i) => console.log(`${i}: ${JSON.stringify(h)}`));
  console.log("row0:", JSON.stringify(data.rows[0]?.slice(0, data.headers.length)));
  await pool.end();
}
void main();
