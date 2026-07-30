/**
 * Story 41.5 — render do Resumão (§4, §6, §7.4).
 *
 * Produz um documento HTML **autocontido**: sem dependência externa além do
 * Chart.js por CDN, que degrada sem quebrar o resto (§AC RN5).
 *
 * ⚠️ Regra do §6 vigente em cada linha deste arquivo: **nenhum número,
 * percentual ou adjetivo de comparação é literal no template**. Toda frase passa
 * por `launch-report-narrative.ts`. Se você for escrever um dígito ou um verbo
 * de direção aqui, pare e derive do dado.
 *
 * ⚠️ Todo conteúdo dinâmico passa por `escaparHtml`: nomes de campanha, produto
 * e criativo vêm de planilha e da Meta, e não são confiáveis por construção.
 *
 * O CSS e o JS de sub-abas são fatorados para a 41.6 reusar — o Comparativo
 * renderiza no mesmo documento. O JS das abas usa **escopo local**
 * (`b.parentElement`), não global, justamente para os dois conviverem.
 */

import type { LaunchReportMetrics } from "./launch-report-engine.js";
import type { AdHighlights, AdRow } from "./launch-report-ads.js";
import type { LaunchReportGuardResult } from "./launch-report-guards.js";
import {
  moedaBr, inteiroBr, pctBr, numeroBr, dataBr, diaMesBr,
  sinalRoas, escaparHtml, escaparJson, verboDirecao, pctComSinal, variacaoPct,
} from "./launch-report-narrative.js";

export interface RenderResumaoInput {
  metricas: LaunchReportMetrics;
  guardas: LaunchReportGuardResult;
  projeto: string;
  etapa: string;
  /** Série diária de faturamento e ingressos, quando disponível (§4 seção 3). */
  serieDiaria?: { dia: string; faturamento: number; ingressos: number }[];
}

// ---------------------------------------------------------------------------
// CSS — paleta escura do §7.4, exportado para a 41.6
// ---------------------------------------------------------------------------

export const CSS_RELATORIO = `
:root{--bg:#0f1115;--card:#171a21;--card2:#1e222b;--bd:#2a2f3a;--tx:#e7eaf0;--tx2:#9aa4b2;
--ok:#3fb950;--warn:#d29922;--ruim:#f85149;--ac:#58a6ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);
font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 12px;padding-bottom:6px;
border-bottom:1px solid var(--bd)}h3{font-size:14px;margin:18px 0 8px;color:var(--tx2)}
.sub{color:var(--tx2);font-size:13px;margin-bottom:20px}
.kg{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0}
.k{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px}
.kl{color:var(--tx2);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.kv{font-size:20px;font-weight:600;margin-top:4px}
.km{color:var(--tx2);font-size:11px;margin-top:4px;line-height:1.4}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 9px;border-bottom:1px solid var(--bd);text-align:right}
th:first-child,td:first-child{text-align:left}
th{color:var(--tx2);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
tbody tr:hover{background:var(--card2)}
tfoot td{font-weight:600;border-top:2px solid var(--bd)}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.note,.ok,.warn,.ins,.proj{border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;
border-left:3px solid var(--bd);background:var(--card)}
.ok{border-left-color:var(--ok)}.warn{border-left-color:var(--warn)}
.ins{border-left-color:var(--ac)}.proj{border-left-color:var(--tx2)}
.qg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.qb{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px}
.st{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px;border-bottom:1px solid var(--bd);
padding-bottom:8px}
.sb{background:var(--card);border:1px solid var(--bd);color:var(--tx2);border-radius:999px;
padding:6px 14px;cursor:pointer;font-size:13px;font-family:inherit}
.sb:hover{color:var(--tx)}
.sb.on{background:var(--ac);border-color:var(--ac);color:#04101f;font-weight:600}
.sc{display:none}.sc.on{display:block}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;
border:1px solid var(--bd);color:var(--tx2)}
.badge.cap{border-color:var(--ac);color:var(--ac)}
.badge.ob{border-color:var(--warn);color:var(--warn)}
.g-ok{color:var(--ok)}.g-ruim{color:var(--ruim)}.g-neutro{color:var(--tx2)}
details{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;
margin:12px 0}
summary{cursor:pointer;color:var(--tx2);font-size:13px}
.mem{color:var(--tx2);font-size:12px}
.mem li{margin:5px 0}
canvas{max-width:100%}
`.trim();

/**
 * JS das sub-abas. **Escopo local** de propósito (`b.parentElement`): o
 * Comparativo (41.6) reusa o mesmo documento e um seletor global faria um grupo
 * de abas controlar o outro.
 */
export const JS_SUBABAS = `
document.addEventListener('click',function(ev){
  var b=ev.target.closest('.sb'); if(!b) return;
  var grupo=b.parentElement; if(!grupo) return;
  var alvo=b.getAttribute('data-alvo'); if(!alvo) return;
  Array.prototype.forEach.call(grupo.querySelectorAll('.sb'),function(x){x.classList.remove('on')});
  b.classList.add('on');
  var host=grupo.parentElement; if(!host) return;
  Array.prototype.forEach.call(host.querySelectorAll(':scope > .sc'),function(s){
    s.classList.toggle('on', s.getAttribute('data-painel')===alvo);
  });
});
`.trim();

// ---------------------------------------------------------------------------
// Blocos auxiliares
// ---------------------------------------------------------------------------

function kpi(label: string, valor: string, memoria?: string): string {
  return `<div class="k"><div class="kl">${escaparHtml(label)}</div>` +
    `<div class="kv">${escaparHtml(valor)}</div>` +
    (memoria ? `<div class="km">${escaparHtml(memoria)}</div>` : "") +
    `</div>`;
}

/** Banner de alertas, agrupado por código com contagem (§AC5). */
function bannerAlertas(g: LaunchReportGuardResult): string {
  if (g.alertas.length === 0) {
    return `<div class="ok">Nenhuma sinalização de qualidade de dado neste período.</div>`;
  }
  const itens = g.alertas
    .map((a) => `<li><strong>${escaparHtml(a.codigo)}</strong> — ${escaparHtml(a.mensagem)}</li>`)
    .join("");
  // A contagem é derivada, não escrita à mão.
  const plural = g.alertas.length === 1 ? "sinalização" : "sinalizações";
  return `<div class="warn"><strong>${inteiroBr(g.alertas.length)} ${plural}</strong>` +
    `<ul style="margin:6px 0 0;padding-left:18px">${itens}</ul></div>`;
}

/** Banner de reconciliação: verde quando fecha, amarelo listando as divergências. */
function bannerReconciliacao(m: LaunchReportMetrics): string {
  if (m.divergencias.length === 0) {
    return `<div class="ok">Reconciliação campanha × anúncio sem divergência acima de ` +
      `${moedaBr(50)} nas ${inteiroBr(m.campanhas.total)} campanhas da etapa.</div>`;
  }
  const linhas = m.divergencias
    .map((d) =>
      `<li>${escaparHtml(d.campaignName)} — campanha ${moedaBr(d.spendCampanha)} vs ` +
      `anúncios ${moedaBr(d.spendAds)} (diferença de ${moedaBr(d.diferenca)})</li>`)
    .join("");
  return `<div class="warn"><strong>${inteiroBr(m.divergencias.length)} campanha(s) com ` +
    `divergência entre campanha e anúncios</strong>` +
    `<ul style="margin:6px 0 0;padding-left:18px">${linhas}</ul></div>`;
}

/** Tabela de classificação de produtos, com subtotal por categoria (§4). */
function tabelaProdutos(m: LaunchReportMetrics): string {
  const linha = (p: LaunchReportMetrics["produtos"][number]) => {
    const badge = p.categoria === "order_bump"
      ? `<span class="badge ob">Order bump</span>`
      : `<span class="badge cap">Captação</span>`;
    const faixa = p.precoMin === p.precoMax
      ? moedaBr(p.precoMin)
      : `${moedaBr(p.precoMin)} – ${moedaBr(p.precoMax)}`;
    return `<tr><td>${escaparHtml(p.nome)}</td><td>${badge}</td>` +
      `<td>${inteiroBr(p.vendas)}</td><td>${moedaBr(p.faturamento)}</td>` +
      `<td>${pctBr(p.pctFaturamento)}</td><td>${faixa}</td></tr>`;
  };

  const cap = m.produtos.filter((p) => p.categoria === "captacao");
  const ob = m.produtos.filter((p) => p.categoria === "order_bump");
  const subtotal = (nome: string, lista: typeof m.produtos) => {
    const v = lista.reduce((s, p) => s + p.vendas, 0);
    const f = lista.reduce((s, p) => s + p.faturamento, 0);
    return `<tr><td colspan="2"><em>Subtotal ${escaparHtml(nome)}</em></td>` +
      `<td><em>${inteiroBr(v)}</em></td><td><em>${moedaBr(f)}</em></td>` +
      `<td><em>${pctBr(m.faturamento.total === 0 ? 0 : (f / m.faturamento.total) * 100)}</em></td>` +
      `<td></td></tr>`;
  };

  return `<div class="tw"><table>
<thead><tr><th>Produto</th><th>Categoria</th><th>Vendas</th><th>Faturamento</th>
<th>% do faturamento</th><th>Faixa de preço</th></tr></thead>
<tbody>${cap.map(linha).join("")}${cap.length ? subtotal("captação", cap) : ""}
${ob.map(linha).join("")}${ob.length ? subtotal("order bump", ob) : ""}</tbody>
<tfoot><tr><td colspan="2">Total</td><td>${inteiroBr(m.ingressos.totais)}</td>
<td>${moedaBr(m.faturamento.total)}</td><td>${pctBr(100)}</td><td></td></tr></tfoot>
</table></div>`;
}

/** Seção 2 — ROAS por origem, 5 linhas com sinal e memória de cálculo. */
function secaoRoas(m: LaunchReportMetrics): string {
  const linhas: [string, { valor: number; memoria: string }][] = [
    ["🔥 Pago Quente", m.roas.pagoQuente],
    ["❄️ Pago Frio", m.roas.pagoFrio],
    ["🟢 Pago Total", m.roas.pago],
    ["🟡 Orgânico", { valor: 0, memoria: "" }],
    ["⚪ Total", m.roas.total],
  ];
  const corpo = linhas
    .filter(([nome]) => nome !== "🟡 Orgânico")
    .map(([nome, r]) =>
      `<tr><td>${escaparHtml(nome)}</td><td>${numeroBr(r.valor, 2)}</td>` +
      `<td>${sinalRoas(r.valor)}</td><td class="mem">${escaparHtml(r.memoria)}</td></tr>`)
    .join("");

  // O orgânico não tem denominador de mídia — exibir "ROAS orgânico" seria
  // inventar uma razão sem investimento. Mostramos o faturamento e explicamos.
  const organico = `<tr><td>🟡 Orgânico</td><td>—</td><td></td>` +
    `<td class="mem">${escaparHtml(
      `faturamento de ${moedaBr(m.faturamento.organico)} sem investimento de mídia associado — ` +
      `não há denominador para ROAS`)}</td></tr>`;

  return `<div class="tw"><table>
<thead><tr><th>Origem</th><th>ROAS</th><th></th><th>Memória de cálculo</th></tr></thead>
<tbody>${corpo}${organico}</tbody></table></div>`;
}

/** Seção 3 — tendência. Sem série diária, degrada para leitura textual (§AC RN). */
function secaoTendencia(input: RenderResumaoInput): string {
  const { serieDiaria, metricas: m } = input;
  if (!serieDiaria || serieDiaria.length === 0) {
    return `<div class="proj">Série diária indisponível para este período — o gráfico de ` +
      `tendência não pôde ser montado. Os totais do período seguem válidos: ` +
      `${moedaBr(m.faturamento.total)} em ${inteiroBr(m.periodo.dias)} dias.</div>`;
  }

  const labels = serieDiaria.map((d) => diaMesBr(d.dia));
  const fat = serieDiaria.map((d) => Number(d.faturamento.toFixed(2)));
  const ing = serieDiaria.map((d) => d.ingressos);

  // Leitura derivada: compara a primeira e a segunda metade do período.
  const meio = Math.floor(serieDiaria.length / 2);
  const somaIni = fat.slice(0, meio).reduce((s, v) => s + v, 0);
  const somaFim = fat.slice(meio).reduce((s, v) => s + v, 0);
  const leitura = meio === 0
    ? ""
    : `<div class="ins">O faturamento ${verboDirecao(somaIni, somaFim)} da primeira para a ` +
      `segunda metade do período (${moedaBr(somaIni)} → ${moedaBr(somaFim)}, ` +
      `${pctComSinal(variacaoPct(somaIni, somaFim))}).</div>`;

  return `${leitura}<canvas id="cTend" height="110"></canvas>
<script>
(function(){
  if(typeof Chart==='undefined') return;
  var el=document.getElementById('cTend'); if(!el) return;
  new Chart(el,{data:{labels:${escaparJson(labels)},datasets:[
    {type:'bar',label:'Faturamento',data:${escaparJson(fat)},backgroundColor:'#58a6ff55',
     borderColor:'#58a6ff',borderWidth:1,yAxisID:'y'},
    {type:'line',label:'Ingressos únicos',data:${escaparJson(ing)},borderColor:'#3fb950',
     backgroundColor:'#3fb950',tension:.3,yAxisID:'y2'}]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#9aa4b2'}}},
      scales:{x:{ticks:{color:'#9aa4b2'},grid:{color:'#2a2f3a'}},
        y:{position:'left',ticks:{color:'#9aa4b2'},grid:{color:'#2a2f3a'}},
        y2:{position:'right',ticks:{color:'#9aa4b2'},grid:{display:false}}}}});
})();
</script>`;
}

/** Seção 6 — destaques por anúncio, em 3 sub-abas. */
function secaoAnuncios(m: LaunchReportMetrics): string {
  if (!m.destaques || m.destaques.visoes.length === 0) {
    return `<div class="proj">Sem dados por anúncio para este período. O ad-level da Meta ` +
      `não está disponível, então os destaques por criativo e o invariante A6 ficam de fora.</div>`;
  }

  const rotulo: Record<string, string> = { Quente: "🔥 Quente", Frio: "❄️ Frio", Total: "🌗 Total" };
  const abas = m.destaques.visoes
    .map((v, i) =>
      `<button class="sb${i === 0 ? " on" : ""}" data-alvo="ads-${escaparHtml(v.visao)}">` +
      `${escaparHtml(rotulo[v.visao] ?? v.visao)}</button>`)
    .join("");

  const paineis = m.destaques.visoes
    .map((v, i) => `<div class="sc${i === 0 ? " on" : ""}" data-painel="ads-${escaparHtml(v.visao)}">${painelVisao(v)}</div>`)
    .join("");

  return `<div class="st">${abas}</div>${paineis}`;
}

function rankingLista(titulo: string, linhas: AdRow[], fmt: (l: AdRow) => string): string {
  if (linhas.length === 0) {
    return `<div class="qb"><div class="kl">${escaparHtml(titulo)}</div>` +
      `<div class="km">sem anúncio elegível</div></div>`;
  }
  const itens = linhas
    .map((l) => `<li>${escaparHtml(l.adName)} — ${escaparHtml(fmt(l))}</li>`)
    .join("");
  return `<div class="qb"><div class="kl">${escaparHtml(titulo)}</div>` +
    `<ol style="margin:6px 0 0;padding-left:18px;font-size:13px">${itens}</ol></div>`;
}

function painelVisao(v: AdHighlights): string {
  if (v.motivoSkip) {
    return `<div class="proj">${escaparHtml(v.motivoSkip)}</div>`;
  }

  const resumo = `<div class="kg">
${kpi("Investimento da visão", moedaBr(v.invVisao))}
${kpi("Anúncios", inteiroBr(v.totalAds))}
${kpi("Acima de 1% do investimento", inteiroBr(v.escalaveis))}
${kpi("Sem venda", inteiroBr(v.zerados))}
</div>`;

  const maiorEscala = v.maiorEscala
    ? `<div class="ins"><strong>Maior escala:</strong> ${escaparHtml(v.maiorEscala.adName)} — ` +
      `${moedaBr(v.maiorEscala.spendAjustado)} (${pctBr(v.maiorEscala.pctInvest)} do investimento), ` +
      `ROAS ${numeroBr(v.maiorEscala.roas, 2)}</div>`
    : "";

  const rankings = `<h3>Performance de campanha</h3><div class="qg">
${rankingLista("Maior CTR", v.maiorCtr, (l) => pctBr(l.ctr, 2))}
${rankingLista("Menor CPC", v.menorCpc, (l) => moedaBr(l.cpc))}
${rankingLista("Menor CPM", v.menorCpm, (l) => moedaBr(l.cpm))}
</div>
<h3>Performance de venda</h3><div class="qg">
${rankingLista("Menor CPV", v.menorCpv, (l) => moedaBr(l.cpv))}
${rankingLista("Maior ROAS", v.maiorRoas, (l) => numeroBr(l.roas, 2))}
</div>
<h3>Performance de qualificação</h3><div class="qg">
${rankingLista("Maior % Faixa A", v.maiorPctA, (l) => `${pctBr(l.pctA)} (${inteiroBr(l.match)} respostas)`)}
${rankingLista("Maior % Faixa A+B", v.maiorPctAB, (l) => `${pctBr(l.pctAB)} (${inteiroBr(l.match)} respostas)`)}
</div>`;

  const linhas = v.tabela
    .map((l) => `<tr><td>${escaparHtml(l.adName)}</td><td>${moedaBr(l.spendAjustado)}</td>` +
      `<td>${pctBr(l.pctInvest)}</td><td>${inteiroBr(l.impressoes)}</td>` +
      `<td>${inteiroBr(l.cliques)}</td><td>${pctBr(l.ctr, 2)}</td><td>${moedaBr(l.cpm)}</td>` +
      `<td>${inteiroBr(l.vendas)}</td><td>${moedaBr(l.faturamento)}</td>` +
      `<td>${moedaBr(l.cpv)}</td><td>${numeroBr(l.roas, 2)}</td></tr>`)
    .join("");

  const tabela = `<details><summary>Tabela completa — top ${inteiroBr(v.tabela.length)} por investimento</summary>
<div class="tw"><table><thead><tr><th>Anúncio</th><th>Investimento</th><th>% inv.</th>
<th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPM</th><th>Vendas</th>
<th>Faturamento</th><th>CPV</th><th>ROAS</th></tr></thead><tbody>${linhas}</tbody></table></div></details>`;

  return resumo + maiorEscala + rankings + tabela;
}

/** Memorial de cálculo (§AC5). */
function memorial(input: RenderResumaoInput): string {
  const { metricas: m, guardas: g } = input;

  const notas = m.notas.map((n) => `<li>${escaparHtml(n)}</li>`).join("");
  const pend = m.pendencias.length
    ? `<li><strong>Pendências:</strong><ul>${m.pendencias.map((p) => `<li>${escaparHtml(p)}</li>`).join("")}</ul></li>`
    : "";

  const invariantes = g.invariantes
    .map((i) => {
      const marca = i.status === "passed" ? "✅" : i.status === "skipped" ? "⏭️" : "❌";
      return `<tr><td>${marca} ${escaparHtml(i.codigo)}</td><td class="mem">${escaparHtml(i.detalhe)}</td></tr>`;
    })
    .join("");

  const sinalizacoes = g.alertas.length
    ? `<div class="tw"><table><thead><tr><th>Código</th><th>Sinalização</th></tr></thead><tbody>` +
      g.alertas.map((a) => `<tr><td>${escaparHtml(a.codigo)}</td><td class="mem">${escaparHtml(a.mensagem)}</td></tr>`).join("") +
      `</tbody></table></div>`
    : `<div class="mem">Nenhuma sinalização.</div>`;

  return `<h2>Memorial de cálculo</h2>
<ul class="mem">
<li><strong>Período:</strong> ${dataBr(m.periodo.inicio)} a ${dataBr(m.periodo.fim)} (${inteiroBr(m.periodo.dias)} dias)</li>
<li><strong>Campanhas:</strong> ${inteiroBr(m.campanhas.total)} vinculadas à etapa, ${inteiroBr(m.campanhas.comInvestimento)} com investimento no período</li>
<li><strong>Imposto:</strong> ${pctBr(m.investimento.impostoPct * 100, 2)}, com origem <em>${escaparHtml(m.investimento.impostoOrigem)}</em>, aplicado uma vez (por <em>${escaparHtml(m.investimento.impostoAplicadoPor)}</em>)</li>
<li><strong>Conferência externa:</strong> ${escaparHtml(g.conferencia.detalhe)}</li>
${notas}${pend}
</ul>
<h3>Invariantes</h3>
<div class="tw"><table><tbody>${invariantes}</tbody></table></div>
<h3>Sinalizações</h3>${sinalizacoes}`;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export function renderResumao(input: RenderResumaoInput): string {
  const { metricas: m, guardas: g, projeto, etapa } = input;

  const titulo = `Resumão ${projeto} ${etapa} — ${dataBr(m.periodo.inicio)} a ${dataBr(m.periodo.fim)}`;

  const kpis = `<div class="kg">
${kpi("Investimento", moedaBr(m.investimento.comImposto), `bruto ${moedaBr(m.investimento.bruto)} + imposto`)}
${kpi("Ingressos únicos", inteiroBr(m.ingressos.unicos), m.cpv.geral.memoria)}
${kpi("Faturamento", moedaBr(m.faturamento.total))}
${kpi("ROAS total", numeroBr(m.roas.total.valor, 2), m.roas.total.memoria)}
${kpi("CPV geral", moedaBr(m.cpv.geral.valor))}
${kpi("Ticket total", moedaBr(m.ticket.total.valor))}
${kpi("CTR", pctBr(m.midia.ctr.valor, 2), m.midia.ctr.memoria)}
${kpi("CPM", moedaBr(m.midia.cpm.valor), m.midia.cpm.memoria)}
</div>`;

  const split = `<div class="kg">
${kpi("🔥 Investimento quente", moedaBr(m.investimento.quente), pctBr(m.investimento.pctQuente))}
${kpi("❄️ Investimento frio", moedaBr(m.investimento.frio), pctBr(m.investimento.pctFrio))}
${kpi("🔥 Ingressos pagos quentes", inteiroBr(m.ingressos.pagoQuente), m.cpv.quente.memoria)}
${kpi("❄️ Ingressos pagos frios", inteiroBr(m.ingressos.pagoFrio), m.cpv.frio.memoria)}
</div>`;

  const orderBump = `<div class="kg">
${kpi("Attach rate geral", pctBr(m.orderBump.attachRateGeral.valor), m.orderBump.attachRateGeral.memoria)}
${kpi("Attach rate pago", pctBr(m.orderBump.attachRatePago.valor), m.orderBump.attachRatePago.memoria)}
${kpi("% faturamento em OB", pctBr(m.orderBump.pctFatObGeral.valor))}
${kpi("Ticket do order bump", moedaBr(m.orderBump.ticketOb.valor))}
</div>`;

  const qualificacao = `<div class="qb"><div class="kl">Taxa de resposta da pesquisa</div>
<div class="kv">${pctBr(m.pesquisa.taxaResposta.valor)}</div>
<div class="km">${escaparHtml(m.pesquisa.taxaResposta.memoria)}</div></div>`;

  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>${CSS_RELATORIO}</style>
<div class="wrap">
<h1>${escaparHtml(titulo)}</h1>
<div class="sub">${escaparHtml(
    `${inteiroBr(m.campanhas.comInvestimento)} campanhas com investimento · ` +
    `fonte: cache de insights da Meta + planilha de vendas da etapa`)}</div>

${bannerAlertas(g)}
${bannerReconciliacao(m)}

<h2>Classificação de produtos</h2>
${tabelaProdutos(m)}

<h2>1. Geral</h2>
${kpis}

<h2>2. ROAS por origem</h2>
${secaoRoas(m)}

<h2>3. Tendência</h2>
${secaoTendencia(input)}

<h2>4. Qualificação</h2>
${qualificacao}

<h2>5. Split quente / frio</h2>
${split}

<h2>6. Order bump</h2>
${orderBump}

<h2>7. Anúncios — destaques</h2>
${secaoAnuncios(m)}

${memorial(input)}
</div>
<script>${JS_SUBABAS}</script>`;
}
