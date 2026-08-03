/**
 * Story 41.9 — render do relatório perpétuo em HTML autocontido (§C.4).
 *
 * Autocontido de verdade: CSS inline, zero script, zero fonte externa. O HTML é
 * servido em iframe sandbox (mesmo padrão de `sprint_reports`), então nada aqui
 * pode depender de rede.
 *
 * Seção ausente NÃO vira tabela vazia nem "indisponível" no lugar da tabela: ela
 * some da estrutura e a limitação aparece nas notas de dado (§C.9).
 */

import type { PerpetualReport, SegmentoRow } from "./perpetual-report-metrics.js";
import { buildReadings, buildDataNotes, trendLabel } from "./perpetual-report-readings.js";

const brl = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number | null, casas = 2) =>
  n === null
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (n: number | null) => (n === null ? "—" : `${num(n * 100, 1)}%`);
const int = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR"));

/** Escapa tudo que vem de nome de campanha/criativo — são dados, não markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#0b0d12;color:#e6e8ee;line-height:1.5;padding:24px;font-size:14px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:22px;font-weight:650;margin-bottom:4px}
h2{font-size:15px;font-weight:600;margin:28px 0 10px;color:#c7cbd6}
.sub{color:#8b93a7;font-size:13px;margin-bottom:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.kpi{background:#151822;border:1px solid #232838;border-radius:10px;padding:12px}
.kpi .lbl{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.03em}
.kpi .val{font-size:19px;font-weight:650;margin-top:3px;font-variant-numeric:tabular-nums}
.kpi .hint{font-size:11px;color:#6f778c;margin-top:2px}
.kpi.pos{border-color:rgba(52,199,123,.4);background:rgba(52,199,123,.07)}
.kpi.neg{border-color:rgba(240,90,90,.4);background:rgba(240,90,90,.07)}
.pos-v{color:#34c77b}.neg-v{color:#f05a5a}
table{width:100%;border-collapse:collapse;font-size:13px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #1e2333;white-space:nowrap}
th:first-child,td:first-child{text-align:left;white-space:normal;min-width:180px}
th{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.03em;font-weight:600}
td{font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:none}
.memo{max-width:520px}
.memo td:first-child{min-width:auto}
.memo .ded td{color:#f05a5a}
.memo .sub-row td{border-top:1px solid #2c3348;font-weight:600}
.memo .res td{border-top:2px solid #3a4258;font-weight:700;font-size:15px}
ul{list-style:none}
li{padding:7px 0 7px 18px;position:relative;border-bottom:1px solid #171b27}
li:last-child{border-bottom:none}
li::before{content:"";position:absolute;left:4px;top:15px;width:5px;height:5px;
  border-radius:50%;background:#5b8def}
.notes li::before{background:#6f778c}
.notes li{font-size:12px;color:#9aa2b6}
.src{background:#111420;border:1px solid #1e2333;border-radius:10px;padding:12px;
  font-size:12px;color:#9aa2b6;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px}
.src b{color:#c7cbd6;font-weight:600}
.trend .up{color:#34c77b}.trend .down{color:#f05a5a}.trend .flat{color:#8b93a7}
footer{margin-top:32px;padding-top:12px;border-top:1px solid #1e2333;
  font-size:11px;color:#6f778c}
`;

function kpiCard(lbl: string, val: string, hint?: string, tone?: "pos" | "neg"): string {
  return `<div class="kpi${tone ? ` ${tone}` : ""}"><div class="lbl">${lbl}</div>
    <div class="val">${val}</div>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
}

function segTable(titulo: string, rows: SegmentoRow[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) => `<tr>
      <td>${esc(r.label)}</td>
      <td>${brl(r.investimento)}</td>
      <td>${pct(r.pctInvestimento)}</td>
      <td>${int(r.vendas)}</td>
      <td>${brl(r.faturamento)}</td>
      <td>${brl(r.cac)}</td>
      <td>${num(r.roas)}</td>
      <td class="${r.margem >= 0 ? "pos-v" : "neg-v"}">${brl(r.margem)}</td>
    </tr>`,
    )
    .join("");
  return `<h2>${titulo}</h2><div class="scroll"><table>
    <thead><tr><th>Nome</th><th>Investimento</th><th>% inv.</th><th>Vendas</th>
    <th>Faturamento</th><th>CAC</th><th>ROAS</th><th>Margem</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

export function renderPerpetualReportHtml(report: PerpetualReport): string {
  const { kpis, periodo, fontes, segmentos } = report;

  const cards = [
    kpiCard(
      "Investimento",
      brl(kpis.investimentoComImposto),
      `${brl(kpis.investimentoBruto)} sem imposto`,
    ),
    kpiCard("Vendas", int(kpis.vendas), `${int(kpis.transacoes)} transações`),
    kpiCard("Faturamento bruto", brl(kpis.faturamentoBruto)),
    kpiCard("Ticket médio", brl(kpis.ticketMedio)),
    kpiCard(
      "CAC",
      brl(kpis.cac),
      kpis.cacBreakeven === null ? undefined : `equilíbrio: ${brl(kpis.cacBreakeven)}`,
    ),
    kpiCard("ROAS", num(kpis.roas)),
    kpiCard(
      "Margem de contribuição",
      brl(kpis.margem),
      kpis.margemPct === null ? undefined : `${pct(kpis.margemPct)} do bruto`,
      kpis.margem >= 0 ? "pos" : "neg",
    ),
    kpiCard(
      "Entrega",
      kpis.ctr === null ? "—" : pct(kpis.ctr),
      `CPC ${brl(kpis.cpc)} · CPM ${brl(kpis.cpm)}`,
    ),
  ].join("");

  const memo = report.memorialMargem
    .map((l) => {
      const cls =
        l.tipo === "deducao" ? "ded" : l.tipo === "subtotal" ? "sub-row" : l.tipo === "resultado" ? "res" : "";
      const valCls = l.tipo === "resultado" ? (l.valor >= 0 ? "pos-v" : "neg-v") : "";
      return `<tr class="${cls}"><td>${esc(l.label)}${l.pct === null ? "" : ` (${pct(l.pct)})`}</td>
        <td class="${valCls}">${brl(l.valor)}</td></tr>`;
    })
    .join("");

  const tend = report.tendencia.disponivel
    ? `<h2>Tendência — período total vs últimos 7 dias</h2><div class="scroll"><table class="trend">
       <thead><tr><th>Métrica</th><th>Período</th><th>Últimos 7 dias</th><th>Variação</th></tr></thead>
       <tbody>${report.tendencia.metricas
         .map((m) => {
           const t = trendLabel(m.deltaPct, m.menorEhMelhor);
           const cls = t.sentido === "melhora" ? "up" : t.sentido === "piora" ? "down" : "flat";
           const fmt = /Investimento|Faturamento|Ticket|CAC/.test(m.metrica) ? brl : num;
           return `<tr><td>${esc(m.metrica)}${m.menorEhMelhor ? " ↓" : ""}</td>
             <td>${fmt(m.total)}</td><td>${fmt(m.ultimos7)}</td>
             <td class="${cls}">${t.texto}</td></tr>`;
         })
         .join("")}</tbody></table></div>
       <p class="sub" style="margin-top:8px;font-size:11px">↓ CAC tem sinal invertido: queda é melhora.</p>`
    : `<h2>Tendência</h2><p class="sub">${esc(report.tendencia.motivo)}</p>
       <div class="scroll"><table><thead><tr><th>Dia</th><th>Vendas</th></tr></thead><tbody>
       ${report.tendencia.vendasPorDia
         .map((d) => `<tr><td>${dataBr(d.dia)}</td><td>${int(d.vendas)}</td></tr>`)
         .join("")}</tbody></table></div>`;

  // Ausente some da estrutura — não vira tabela vazia (§C.9).
  const micro = [
    segTable("Público (quente vs frio)", segmentos.quenteFrio),
    segmentos.formato ? segTable("Formato", segmentos.formato) : "",
    segTable("Campanhas", segmentos.campanhas),
    segmentos.publicos ? segTable("Conjuntos (público)", segmentos.publicos) : "",
    segmentos.criativos ? segTable("Criativos", segmentos.criativos) : "",
  ].join("");

  const leituras = buildReadings(report)
    .map((l) => `<li>${esc(l)}</li>`)
    .join("");
  const notas = buildDataNotes(report)
    .map((n) => `<li>${esc(n)}</li>`)
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fontes.funil)} — Relatório Perpétuo</title><style>${CSS}</style></head>
<body><div class="wrap">
  <h1>${esc(fontes.funil)} — Relatório de Funil Perpétuo</h1>
  <p class="sub">${dataBr(periodo.inicio)} a ${dataBr(periodo.fim)} · ${periodo.dias} dias${
    fontes.produto ? ` · ${esc(fontes.produto)}` : ""
  }</p>

  <div class="kpis">${cards}</div>

  <h2>Memorial da margem</h2>
  <div class="scroll"><table class="memo"><tbody>${memo}</tbody></table></div>

  <h2>Fontes</h2>
  <div class="src">
    <div><b>Expert:</b> ${esc(fontes.expert)}</div>
    <div><b>Campanhas vinculadas:</b> ${int(fontes.campanhasVinculadas)}</div>
    <div><b>Prefixo do ciclo:</b> ${fontes.prefixoCampanha ? esc(fontes.prefixoCampanha) : "—"}</div>
    <div><b>Impressões:</b> ${int(kpis.impressoes)}</div>
    <div><b>Cliques:</b> ${int(kpis.cliques)}</div>
    <div><b>Receita líquida:</b> ${pct(fontes.receitaLiquidaPct)}</div>
  </div>

  ${micro}
  ${tend}

  <h2>Leituras</h2><ul>${leituras}</ul>
  <h2>Notas de dado</h2><ul class="notes">${notas}</ul>

  <footer>Gerado pelo Loyola X a partir da planilha do funil e do cache de insights da Meta.
  O relatório é um retrato do período — regerar depois pode dar número diferente.</footer>
</div></body></html>`;
}
