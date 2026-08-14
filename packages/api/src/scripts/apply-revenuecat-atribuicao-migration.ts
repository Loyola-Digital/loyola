// Story 42.6 — aplica a migration 0104_revenuecat_atribuicao.sql (8 colunas de
// atribuição em revenuecat_sales) e faz o BACKFILL dos eventos já recebidos a
// partir do `payload` que sempre foi gravado.
//
// Mesmo padrão dos outros apply-* — usa a DATABASE_URL do .env. Idempotente:
// rodar duas vezes produz o mesmo resultado.
//
// O relatório de cobertura no final é o entregável de negócio da story: ele diz
// quanto do rastreio de anúncios realmente chega até a venda.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { readSubscriberAttribute } from "../services/revenuecat.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, "../db/migrations/0104_revenuecat_atribuicao.sql"),
  "utf-8",
);

/** Mesma precedência do normalize: utm_* vence, reservado com `$` é fallback. */
const CAMPOS: Array<{ coluna: string; chaves: string[] }> = [
  { coluna: "utm_source", chaves: ["utm_source", "$mediaSource"] },
  { coluna: "utm_medium", chaves: ["utm_medium"] },
  { coluna: "utm_campaign", chaves: ["utm_campaign", "$campaign"] },
  { coluna: "utm_term", chaves: ["utm_term", "$keyword"] },
  { coluna: "utm_content", chaves: ["utm_content", "$creative"] },
  { coluna: "gclid", chaves: ["gclid"] },
  { coluna: "fbclid", chaves: ["fbclid"] },
  { coluna: "acquisition_source", chaves: ["acquisition_source"] },
];

const TIPOS_RECEITA = ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "UNCANCELLATION"];

/** varchar(255)/varchar(64) — corta em vez de estourar a inserção. */
function cortar(valor: string | null, limite: number): string | null {
  if (valor === null) return null;
  return valor.length > limite ? valor.slice(0, limite) : valor;
}

const LIMITES: Record<string, number> = {
  utm_source: 255,
  utm_medium: 255,
  utm_campaign: 255,
  utm_term: 255,
  utm_content: 255,
  acquisition_source: 64,
};

function pct(parte: number, total: number): string {
  if (total === 0) return "—";
  return `${((parte / total) * 100).toFixed(1).replace(".", ",")}%`;
}

async function main() {
  await pool.query(sql);
  console.log("migration 0104 aplicada\n");

  // ── Backfill ────────────────────────────────────────────────────────────
  // Lê em páginas para não carregar todos os payloads na memória de uma vez —
  // hoje são ~7,7 mil linhas, mas o webhook segue recebendo.
  const PAGINA = 500;
  let offset = 0;
  let processados = 0;
  let descartados = 0;

  for (;;) {
    const { rows } = await pool.query<{ id: string; attrs: unknown }>(
      `SELECT id, payload->'event'->'subscriber_attributes' AS attrs
       FROM revenuecat_sales
       ORDER BY created_at
       LIMIT $1 OFFSET $2`,
      [PAGINA, offset],
    );
    if (rows.length === 0) break;

    const ids: string[] = [];
    const valores: Array<Array<string | null>> = [];

    for (const row of rows) {
      ids.push(row.id);
      const linha = CAMPOS.map(({ coluna, chaves }) => {
        let v: string | null = null;
        for (const chave of chaves) {
          v = readSubscriberAttribute(row.attrs, chave);
          if (v !== null) break;
        }
        // Contabiliza o que existia no payload mas foi descartado como lixo
        // (macro não interpolado, "(not set)"): truncar em silêncio foi o que
        // deixou o problema invisível até agora.
        if (v === null && row.attrs && typeof row.attrs === "object") {
          const cru = (row.attrs as Record<string, unknown>)[chaves[0]];
          if (cru !== undefined && cru !== null) descartados++;
        }
        const limite = LIMITES[coluna];
        return limite ? cortar(v, limite) : v;
      });
      valores.push(linha);
    }

    // UPDATE em lote: uma query por página, não uma por evento.
    const sets = CAMPOS.map((c, i) => `"${c.coluna}" = v.c${i}`).join(", ");
    const colunasVirtuais = CAMPOS.map((_, i) => `c${i}`).join(", ");
    const tuplas = valores
      .map(
        (linha, i) =>
          `($${i * (CAMPOS.length + 1) + 1}::uuid, ${linha
            .map((_, j) => `$${i * (CAMPOS.length + 1) + j + 2}`)
            .join(", ")})`,
      )
      .join(", ");
    const params = valores.flatMap((linha, i) => [ids[i], ...linha]);

    await pool.query(
      `UPDATE revenuecat_sales AS s
       SET ${sets}
       FROM (VALUES ${tuplas}) AS v(id, ${colunasVirtuais})
       WHERE s.id = v.id`,
      params,
    );

    processados += rows.length;
    offset += PAGINA;
  }

  console.log(`backfill: ${processados} eventos reprocessados a partir do payload`);
  console.log(`          ${descartados} valores descartados por macro não interpolado ou "(not set)"\n`);

  // ── Relatório de cobertura ──────────────────────────────────────────────
  const tiposLista = TIPOS_RECEITA.map((t) => `'${t}'`).join(",");
  const totais = await pool.query<{ total: number; receita: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE event_type IN (${tiposLista}))::int AS receita
     FROM revenuecat_sales`,
  );
  const { total, receita } = totais.rows[0];
  console.log(`revenuecat_sales: ${total} eventos | ${receita} de receita\n`);

  for (const { coluna } of CAMPOS) {
    const r = await pool.query<{ n: number; n_receita: number }>(
      `SELECT count(*) FILTER (WHERE "${coluna}" IS NOT NULL)::int AS n,
              count(*) FILTER (WHERE "${coluna}" IS NOT NULL
                               AND event_type IN (${tiposLista}))::int AS n_receita
       FROM revenuecat_sales`,
    );
    const { n, n_receita } = r.rows[0];
    console.log(
      `  ${coluna.padEnd(18)} ${String(n).padStart(5)} (${pct(n, total).padStart(6)})` +
        `  | em receita: ${String(n_receita).padStart(4)} (${pct(n_receita, receita)})`,
    );
  }

  // O número que decide se a Story 42.7 é viável: id numérico da Meta é o que
  // permite cruzar a venda com campanha/anúncio. Texto como "ig4a" não permite.
  const meta = await pool.query<{ camp: number; cont: number; camp_rec: number; cont_rec: number }>(
    `SELECT count(*) FILTER (WHERE utm_campaign ~ '^[0-9]{10,}$')::int AS camp,
            count(*) FILTER (WHERE utm_content  ~ '^[0-9]{10,}$')::int AS cont,
            count(*) FILTER (WHERE utm_campaign ~ '^[0-9]{10,}$'
                             AND event_type IN (${tiposLista}))::int AS camp_rec,
            count(*) FILTER (WHERE utm_content  ~ '^[0-9]{10,}$'
                             AND event_type IN (${tiposLista}))::int AS cont_rec
     FROM revenuecat_sales`,
  );
  const m = meta.rows[0];
  console.log(
    `\n  com id numérico da Meta — campanha: ${m.camp} (receita: ${m.camp_rec})` +
      ` | anúncio: ${m.cont} (receita: ${m.cont_rec})`,
  );
  if (m.cont_rec === 0) {
    console.log(
      "\n  ⚠️  Nenhuma VENDA carrega id de anúncio da Meta. Colunas de receita por\n" +
        "      criativo (Story 42.7) mostrariam zero em toda linha — o rastreio\n" +
        "      precisa ser corrigido antes.",
    );
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
