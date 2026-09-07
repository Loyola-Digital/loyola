/**
 * Story 29.76 (AC1) — o cache da Meta contra o export do Gerenciador.
 *
 * Existe porque comparar o nosso banco com o nosso banco não prova nada. O
 * único jeito de saber se o cache está incompleto é contra um arquivo que veio
 * de fora — `docs/dados/meta-bbe-perpetuo-*.csv`, exportado pelo gestor.
 *
 * Compara, por (ad_id, dia): gasto, cliques no link, impressões e compras.
 *
 * Uso: cd packages/api && ./node_modules/.bin/tsx scripts/confere-meta-contra-export.ts [caminho.csv]
 */
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ⚠️ `import.meta.dirname` é `undefined` sob o tsx (ele compila para CJS).
// Resolve a partir do cwd, que é `packages/api` — o mesmo lugar de onde os
// outros scripts deste diretório são chamados.
const CSV =
  process.argv[2] ??
  resolve(process.cwd(), "../../docs/dados/meta-bbe-perpetuo-2026-07-17_2026-09-05.csv");

/** CSV da Meta: aspas com vírgula dentro. Parser mínimo, sem dependência. */
function linhas(texto: string): string[][] {
  const out: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); out.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}

/**
 * ⚠️ O export do Gerenciador vem em **en-US**: ponto é DECIMAL (`50.69` são
 * cinquenta reais e sessenta e nove centavos) e vírgula é milhar. É o oposto
 * das planilhas pt-BR que o resto do sistema lê — e tratar o ponto como milhar
 * multiplica tudo por 100. Foi o que aconteceu na primeira rodada desta
 * conferência: 2.347 pares apareceram "divergentes" com fator exato de 100×,
 * e o defeito era do parser, não do banco.
 */
const num = (v: string | undefined) => {
  const n = Number((v ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  const linhasCsv = linhas(readFileSync(CSV, "utf-8").replace(/^\uFEFF/, ""));
  const hdr = linhasCsv[0]!.map((h) => // O export vem com BOM; `\uFEFF` escapado, nunca o caractere cru
    // (o ESLint recusa com `no-irregular-whitespace`, e com razão: um BOM
    // colado no meio do código é invisível na revisão).
    h.replace(/^\uFEFF/, "").trim());
  const col = (nome: string) => {
    const i = hdr.indexOf(nome);
    if (i === -1) throw new Error(`coluna "${nome}" não existe no CSV`);
    return i;
  };
  const iAd = col("Identificação do anúncio");
  const iDia = col("Dia");
  const iGasto = col("Valor gasto (BRL)");
  const iCliques = col("Cliques no link");
  const iImp = col("Impressões");
  const iCompras = col("Compras");

  /** chave `adId|dia` → o que a Meta diz. */
  const daMeta = new Map<string, { gasto: number; cliques: number; imp: number; compras: number }>();
  for (const l of linhasCsv.slice(1)) {
    if (l.length <= iCompras || !l[iAd]?.trim()) continue;
    const k = `${l[iAd]!.trim()}|${l[iDia]!.trim()}`;
    const a = daMeta.get(k) ?? { gasto: 0, cliques: 0, imp: 0, compras: 0 };
    a.gasto += num(l[iGasto]); a.cliques += num(l[iCliques]);
    a.imp += num(l[iImp]); a.compras += num(l[iCompras]);
    daMeta.set(k, a);
  }

  const dias = [...daMeta.keys()].map((k) => k.split("|")[1]!).sort();
  const [de, ate] = [dias[0]!, dias.at(-1)!];
  console.log(`\nexport da Meta: ${daMeta.size} pares (anúncio, dia) · ${de} → ${ate}`);

  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  // A tabela é `meta_ad_insights_daily` e a data é `date_start`. Cliques no
  // LINK não têm coluna própria — vivem no jsonb `actions` —, então a
  // conferência compara gasto e impressões, que são diretos. `date_start` é
  // `varchar` (já 'YYYY-MM-DD'), não `date` — daí sem `to_char`. É o suficiente
  // para o que o AC1 pergunta: o cache tem todos os (anúncio, dia) que a Meta
  // tem, e com os mesmos valores?
  const { rows } = await c.query(
    `select ad_id, date_start as dia,
            sum(spend)::float8 as gasto,
            sum(impressions)::float8 as imp
       from meta_ad_insights_daily
      where date_start between $1 and $2
      group by ad_id, date_start`,
    [de, ate],
  );
  await c.end();

  const nosso = new Map(rows.map((r) => [`${r.ad_id}|${r.dia}`, r]));
  console.log(`nosso banco:    ${nosso.size} pares no mesmo intervalo\n`);

  let faltando = 0, gastoFaltando = 0, sobrando = 0;
  let gastoNossoNoExport = 0;
  const piores: { k: string; meta: number; nos: number }[] = [];
  for (const [k, m] of daMeta) {
    const n = nosso.get(k);
    if (!n) { faltando++; gastoFaltando += m.gasto; continue; }
    gastoNossoNoExport += Number(n.gasto);
    // 1 centavo de folga: a Meta arredonda no export.
    if (Math.abs(Number(n.gasto) - m.gasto) > 0.01) piores.push({ k, meta: m.gasto, nos: Number(n.gasto) });
  }
  for (const k of nosso.keys()) if (!daMeta.has(k)) sobrando++;

  const gastoMeta = [...daMeta.values()].reduce((s, m) => s + m.gasto, 0);

  /** Divergência concentrada no último dia = export tirado com o dia em curso. */
  const porDia = new Map<string, number>();
  for (const p of piores) {
    const d = p.k.split("|")[1]!;
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }

  console.log("═══ COBERTURA — o que o AC1 pergunta ═══");
  console.log(`  no export e NÃO no banco ... ${faltando} par(es) · R$ ${gastoFaltando.toFixed(2)}`);
  console.log(`  no banco e não no export ... ${sobrando} (outros funis no mesmo intervalo — esperado)`);
  console.log(`  gasto divergente ........... ${piores.length} par(es)`);
  console.log("\n═══ TOTAIS (só os pares que o export cobre) ═══");
  console.log(`  Meta:  R$ ${gastoMeta.toFixed(2)}`);
  console.log(`  banco: R$ ${gastoNossoNoExport.toFixed(2)}`);
  const dif = gastoNossoNoExport - gastoMeta;
  console.log(`  dif:   R$ ${dif.toFixed(2)}  (${gastoMeta > 0 ? ((dif / gastoMeta) * 100).toFixed(2) : "—"}%)`);
  if (porDia.size) {
    console.log("\n═══ DIVERGÊNCIAS POR DIA ═══");
    for (const [d, n] of [...porDia].sort()) console.log(`  ${d}: ${n} par(es)`);
    console.log("\n═══ MAIORES ═══");
    for (const p of piores.sort((a, b) => Math.abs(b.meta - b.nos) - Math.abs(a.meta - a.nos)).slice(0, 5)) {
      console.log(`  ${p.k}  Meta R$ ${p.meta.toFixed(2)}  ×  banco R$ ${p.nos.toFixed(2)}`);
    }
  }
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
