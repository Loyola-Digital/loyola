import { it } from "vitest";
import "dotenv/config";
import fs from "fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { launchReportConfigs, expertReportConfigs } from "../db/schema.js";

it("insert real", { timeout: 60000 }, async () => {
  const url = fs.readFileSync(".env","utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim();
  const pool = new pg.Pool({ connectionString: url, ssl: false });
  const db = drizzle(pool, { schema });
  const stageId = "8fbd8031-6834-4d5b-98d6-7ce9860b48d7";
  try {
    await db.insert(launchReportConfigs).values({
      stageId, tipo: "pago", etapa: "vendas-captacao", entidadeCaptura: "vendas",
      dataInicio: null, dataFim: null, impostoPct: "0.1215",
    });
    process.stdout.write("\n  INSERT stage: OK\n");
    await pool.query("delete from launch_report_configs where stage_id=$1", [stageId]);
  } catch (e) {
    process.stdout.write(`\n  INSERT stage FALHOU: ${(e as Error).message}\n`);
  }
  const projectId = "738cda16-c5be-4268-9c98-92e46c359569";
  try {
    await db.insert(expertReportConfigs).values({ projectId, camposPesquisa: { faixa: "Q1" } });
    process.stdout.write("  INSERT expert: OK\n");
    await pool.query("delete from expert_report_configs where project_id=$1", [projectId]);
  } catch (e) {
    process.stdout.write(`  INSERT expert FALHOU: ${(e as Error).message}\n`);
  }
  await pool.end();
});
