// Backfill de assinaturas Kiwify a partir do CSV exportado (Subscriptions export).
// Sobe o snapshot histórico para kiwify_subscriptions (estado real). Idempotente.
//
//   tsx src/scripts/backfill-kiwify-subscriptions.ts --project=<uuid|nome> --file=<caminho.csv> [--dry]
//
// O export da Kiwify NÃO traz subscription_id, então geramos um id sintético
// determinístico ("csv:<sha1(email|produto|plano|inicio)>"). Reexecutar o mesmo
// CSV atualiza as mesmas linhas (ON CONFLICT). ATENÇÃO: webhooks ao vivo usam o
// subscription_id REAL da Kiwify — uma assinatura que depois vier por webhook
// entra como linha nova (não reconcilia com a do CSV). Trate o CSV como snapshot.
//
// Colunas esperadas (header, nomes do export Kiwify):
//   Status, Product Name, Payment Method, Plan Name, Customer Name, Customer Email,
//   Customer Phone, Customer CPF / CNPJ, Customer IP, Sale Type, Price,
//   Last Payment At, Started At, Ended At, Canceled At, Cancel Reason,
//   Current Period Start, Current Period End
// Mapeamento -> kiwify_subscriptions:
//   Status->status (canônico), Product Name->product_name, Plan Name->plan_name,
//   Customer Name/Email->customer_*, Price->amount (CENTAVOS, como vem),
//   Started At->started_at, Current Period End->next_charge_at, Canceled At->canceled_at.
//   currency=BRL. amount = valor da cobrança do PERÍODO do plano (anual/mensal/
//   trimestral), NÃO normalizado para mensal.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { mapKiwifyStatus } from "../services/kiwify-subscriptions.js";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split("=").slice(1).join("=") : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/** Tokenizer CSV (campos entre aspas com vírgulas internas; "" = aspas escapada). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** "YYYY-MM-DD HH:mm[:ss]" (ou ISO) -> Date UTC. Vazio/inválido -> null. */
function parseCsvDateUtc(s: string | undefined): Date | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d; }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

function parseCents(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!t || Number.isNaN(Number(t))) return null;
  return Math.round(Number(t));
}

/** id sintético determinístico (sem subscription_id no export). */
function syntheticId(email: string, product: string, plan: string, started: string): string {
  return "csv:" + createHash("sha1").update(`${email}|${product}|${plan}|${started}`).digest("hex").slice(0, 32);
}

async function main() {
  const projectArg = arg("project");
  const file = arg("file");
  const dry = hasFlag("dry");
  if (!projectArg || !file) {
    console.error("Uso: --project=<uuid|nome> --file=<caminho.csv> [--dry]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  // Resolve o projeto (uuid exato ou nome ILIKE).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(projectArg);
  const res = isUuid
    ? await pool.query("SELECT id, name FROM projects WHERE id = $1", [projectArg])
    : await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1", [`%${projectArg}%`]);
  if (res.rows.length === 0) { console.error(`Nenhum projeto casa "${projectArg}".`); await pool.end(); process.exit(1); }
  if (res.rows.length > 1) {
    console.error("Mais de um projeto casa:", res.rows.map((r) => `${r.name} (${r.id})`).join(", "));
    await pool.end(); process.exit(1);
  }
  const projectId = res.rows[0].id as string;
  console.log(`Projeto alvo: ${res.rows[0].name} (${projectId})`);

  // Parse do CSV -> registros por nome de coluna.
  const grid = parseCsv(readFileSync(file, "utf8"));
  const header = grid[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    status: idx("Status"), product: idx("Product Name"), plan: idx("Plan Name"),
    name: idx("Customer Name"), email: idx("Customer Email"), price: idx("Price"),
    started: idx("Started At"), canceled: idx("Canceled At"), periodEnd: idx("Current Period End"),
  };
  for (const [k, v] of Object.entries(col)) {
    if (v < 0) { console.error(`Coluna ausente no CSV: "${k}". Header lido: ${header.join(" | ")}`); await pool.end(); process.exit(1); }
  }

  const dataRows = grid.slice(1);
  let written = 0;
  const byStatus: Record<string, number> = {};
  let activeAmount = 0;

  for (const r of dataRows) {
    const email = (r[col.email] ?? "").trim();
    const product = (r[col.product] ?? "").trim();
    const plan = (r[col.plan] ?? "").trim();
    const startedRaw = (r[col.started] ?? "").trim();
    const status = mapKiwifyStatus(r[col.status]);
    const amount = parseCents(r[col.price]);
    const subscriptionId = syntheticId(email, product, plan, startedRaw);

    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "active" && amount) activeAmount += amount;

    if (!dry) {
      await pool.query(
        `INSERT INTO kiwify_subscriptions
           (project_id, subscription_id, product_name, plan_name, customer_email, customer_name,
            status, amount, currency, started_at, next_charge_at, canceled_at,
            last_event_type, last_event_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'BRL',$9,$10,$11,'backfill_csv',NULL,now())
         ON CONFLICT (project_id, subscription_id) DO UPDATE SET
           product_name = EXCLUDED.product_name,
           plan_name = EXCLUDED.plan_name,
           customer_email = EXCLUDED.customer_email,
           customer_name = EXCLUDED.customer_name,
           status = EXCLUDED.status,
           amount = EXCLUDED.amount,
           started_at = EXCLUDED.started_at,
           next_charge_at = EXCLUDED.next_charge_at,
           canceled_at = EXCLUDED.canceled_at,
           updated_at = now()`,
        [
          projectId, subscriptionId, product || null, plan || null, email || null,
          (r[col.name] ?? "").trim() || null, status, amount,
          parseCsvDateUtc(startedRaw), parseCsvDateUtc(r[col.periodEnd]), parseCsvDateUtc(r[col.canceled]),
        ],
      );
    }
    written++;
  }

  console.log(`\n=== ${dry ? "DRY-RUN (nada gravado)" : "BACKFILL CONCLUÍDO"} ===`);
  console.log(`Linhas processadas: ${written}`);
  console.log("Por status:", JSON.stringify(byStatus));
  console.log(`Soma 'amount' das vigentes (centavos): ${activeAmount} (R$ ${(activeAmount / 100).toFixed(2)})`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
