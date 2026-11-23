import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";

// Restaura as 39 garantias que o `drizzle-kit push --force` apagou quando
// voltou a aplicar schema (26 CHECKs, 1 UNIQUE, 12 índices — ver o .sql).
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio):
//   pnpm --filter @loyola-x/api exec tsx migrate-0185.ts
//
// Executa o arquivo inteiro numa chamada só: o Postgres trata isso como UMA
// transação implícita, então ou tudo entra ou nada entra — é o que se quer aqui,
// porque meia restauração é pior que nenhuma (ninguém saberia o que falta).
//
// Conta antes e depois pelo catálogo, e não pela quantidade de statements: o que
// importa é o banco ter as garantias de volta.

config();

const ARQUIVO = "src/db/migrations/0185_restaura_o_que_o_push_dropou.sql";

const ESPERADOS = {
  checks: [
    "stage_sales_spreadsheets_subtype_check", "funnel_batch_turns_nota_tamanho",
    "funnel_batch_turns_tem_conteudo", "manual_sales_invoice_status_check",
    "ck_people_absences_periodo", "ck_people_records_foto", "planner_annual_cells_mes_check",
    "people_records_cpf_digitos", "people_records_cnpj_digitos", "people_records_endereco_tamanho",
    "ab_tests_status_valido", "ab_tests_variacoes_lista", "notification_prefs_hora_check",
    "alert_rules_metrica_check", "alert_rules_comparador_check", "alert_rules_janela_check",
    "chk_meta_entity_type", "ck_plan_simulators_fracoes", "ck_plan_simulators_valores",
    "ck_plan_organic_blocks_canal", "ck_plan_organic_blocks_valores",
    "ck_plan_organic_combinations_valores", "ck_plan_paid_blocks_fonte",
    "ck_plan_paid_blocks_valores", "ck_plan_paid_combinations_valores",
    "ck_plan_final_scenarios_valores",
  ],
  // `sprint_dashboard_config_singleton_uniq` fica fora: o push a recriou como
  // ÍNDICE único (é como o schema a declara), então a garantia está de pé.
  uniques: ["sendflow_connections_project_id_key"],
  indices: [
    "uq_stage_sales_spreadsheets_single_slot", "uq_sendflow_global", "uq_funnel_maps_share_token",
    "uq_swipe_clickup_alerts_unica", "idx_swipe_files_import_key", "idx_funnels_active",
    "stage_operational_costs_stage_idx",
    "sprint_reports_created_idx", "idx_swipe_files_tags", "idx_funnel_maps_soltos",
    "project_source_rules_globais_idx", "idx_funnel_map_comments_thread",
  ],
};

async function faltando(pool: Pool): Promise<{ checks: string[]; uniques: string[]; indices: string[] }> {
  const { rows: cons } = await pool.query(`SELECT conname FROM pg_constraint;`);
  const { rows: idx } = await pool.query(`SELECT indexname FROM pg_indexes;`);
  const temCons = new Set(cons.map((r) => r.conname));
  const temIdx = new Set(idx.map((r) => r.indexname));
  return {
    checks: ESPERADOS.checks.filter((n) => !temCons.has(n)),
    uniques: ESPERADOS.uniques.filter((n) => !temCons.has(n)),
    indices: ESPERADOS.indices.filter((n) => !temIdx.has(n)),
  };
}

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0185.");
    process.exit(1);
  }

  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(path.join(raiz, ARQUIVO), "utf8");

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    const antes = await faltando(pool);
    console.log(
      `Antes — faltam ${antes.checks.length} CHECKs, ${antes.uniques.length} UNIQUEs, ` +
        `${antes.indices.length} índices.`,
    );

    console.log("Aplicando migration 0185 (restauração)...");
    await pool.query(sql);

    const depois = await faltando(pool);
    console.log(
      `Depois — faltam ${depois.checks.length} CHECKs, ${depois.uniques.length} UNIQUEs, ` +
        `${depois.indices.length} índices.`,
    );
    for (const [grupo, lista] of Object.entries(depois)) {
      if (lista.length) console.error(`AINDA FALTA em ${grupo}: ${lista.join(", ")}`);
    }
    const total = depois.checks.length + depois.uniques.length + depois.indices.length;
    if (total > 0) process.exitCode = 1;
    else console.log("Migration 0185 aplicada — as 39 garantias estão de volta.");
  } catch (err) {
    // Um CHECK pode falhar se alguma linha tiver sido gravada fora da regra
    // enquanto ele não existia. Nesse caso a mensagem do Postgres diz qual, e o
    // certo é resolver o dado — não afrouxar a regra.
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
