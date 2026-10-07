/**
 * Story 49.6 — render do Debriefing de lançamento no padrão visual da skill
 * `loyola-debriefing` (`data/padrao-visual-entregaveis.md` + a referência-mestre
 * `templates/referencia-relatorio-dg.html`).
 *
 * **Puro** (AC10): recebe o payload da 49.5 (e, havendo comparação, o payload do
 * lançamento de comparação principal) e só FORMATA. Sem banco, sem relógio, sem
 * aleatório — a data do documento é `payload.geradoEm`. Os únicos números que
 * nascem aqui são o Δ (`variacaoPct` e a diferença em pp/absoluta) e o eixo D+n
 * (dia relativo ao início da captação, AC6.1). Imposto nunca é reaplicado: o
 * custo exibido é o do payload, com a procedência declarada.
 *
 * Decisões de forma (registradas no Dev Agent Record):
 *  - TABELAS em HTML estático (REL-002 da 49.8): a edição inline do viewer
 *    sobrevive ao reabrir. Só os gráficos dependem de JS, todos de UM `const D`.
 *  - Chart.js 4.4.1 + datalabels 2.2.0 por CDN, versões fixas (AC5). Sem a CDN o
 *    documento continua legível: as tabelas não dependem de script e o lugar de
 *    cada gráfico diz que ele não carregou (R7).
 *  - Numeração GLOBAL e contínua das seções (00…17) atravessando as abas, na
 *    ordem canônica do §4 — o teste de estrutura confere a ordem pelos `sec-num`.
 *  - Blocos de texto da IA (49.7): o espaço existe com `data-bloco-ia` e mostra
 *    só leituras determinísticas derivadas do payload (estado ANTERIOR à 49.7).
 */

import type { Canal, Fechamento, SegmentoDeQualificacao, Utm } from "@loyola-x/shared";
import { CANAIS, SEGMENTOS_DE_QUALIFICACAO } from "@loyola-x/shared";
import type { DebriefingPayload } from "./debriefing-payload.js";
import type { AlertaFase12 } from "./debriefing-guards.js";
import type { DebriefingAviso } from "./debriefing-config.js";
import type { Metrica } from "./debriefing-money-time-engine.js";
import {
  corteSemCarrinho,
  diasEntre,
  fasesComCarrinhoAberto,
  somarDias,
  textoDaFaseEmCurso,
  textoDaFaseNoCorte,
  textoDaFaseQueNaoComecou,
  textoDaLacunaDoCarrinho,
  type CorteDaJanela,
} from "./debriefing-hygiene.js";
import { parcialDo } from "./debriefing-payload.js";
import {
  avaliacao,
  dataBr,
  diaMesBr,
  escaparHtml,
  escaparJson,
  inteiroBr,
  moedaBr,
  numeroBr,
  pctBr,
  pctComSinal,
  seta,
  variacaoPct,
  verboDirecao,
} from "./launch-report-narrative.js";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/**
 * De onde vieram os números do lançamento de comparação (R7-7):
 * - `recalculada`: pelos MESMOS motores, com a config de debriefing dele;
 * - `payload-salvo`: ele não tem config de debriefing liberada — vale o último
 *   payload persistido dele (`debriefing_payloads`, 0165), com aviso no topo.
 */
export type OrigemDaComparacao =
  | { tipo: "recalculada" }
  | { tipo: "payload-salvo"; debriefingId: string; salvoEm: string; motivo: string };

/** Lançamento de comparação PRINCIPAL (o 1º da lista efetiva, R6-5) — fonte do Δ. */
export interface ComparacaoDoDebriefing {
  funnelId: string;
  nome: string;
  payload: DebriefingPayload;
  origem: OrigemDaComparacao;
}

/** Código do alerta não bloqueante de produto fora do mapa na captação (R7-6). */
export const ALERTA_PRODUTO_FORA_DO_MAPA = "PRODUTO_FORA_DO_MAPA_NA_CAPTACAO";
/** Código do aviso de Δ contra payload salvo (R7-7). */
export const AVISO_COMPARACAO_DE_PAYLOAD_SALVO = "COMPARACAO_DE_PAYLOAD_SALVO";
/**
 * Story 49.12 (AC8, R8-3) — parcial cuja comparação só tem payload salvo: um
 * relatório salvo tem os totais fechados e não pode ser cortado em D+N — o
 * documento sai SEM Δ, com este aviso (a geração não é bloqueada).
 */
export const AVISO_COMPARACAO_SEM_CORTE_EM_D_MAIS_N = "COMPARACAO_SEM_CORTE_EM_D_MAIS_N";

/** Dia (YYYY-MM-DD) em Brasília de um instante ISO — BRT é UTC−3 fixo desde 2019. */
function diaBrtDe(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 10) : new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Rede do link do criativo (R7-9): post do Instagram, post do Facebook ou o Ads Manager (sem post). */
export function redeDoLinkDoCriativo(c: { linkDoPost: string | null; linkAdsManager: string | null }): "instagram" | "facebook" | "ads-manager" | null {
  if (c.linkDoPost) return /^https:\/\/(www\.)?instagram\.com\//i.test(c.linkDoPost) ? "instagram" : "facebook";
  return c.linkAdsManager ? "ads-manager" : null;
}

export interface DebriefingRenderInput {
  payload: DebriefingPayload;
  /** `null` = edição única (sem lançamento de comparação). */
  comparacao: ComparacaoDoDebriefing | null;
  rotulos: {
    /** Expert (nome do projeto). */
    projeto: string;
    /** Nome do funil do lançamento atual (A). */
    lancamento: string;
    /** stageId → nome da etapa (atual e comparação). */
    etapas: Readonly<Record<string, string>>;
    /** funnelId → nome do funil (lista de comparação, série histórica). */
    funis: Readonly<Record<string, string>>;
  };
  /** Alertas das guardas (49.5) — banner no topo, não bloqueiam (AC7). */
  alertas: readonly AlertaFase12[];
  /**
   * Story 49.12 (AC8) — a parcial cujo lançamento de comparação só tem payload
   * salvo: sem Δ (`comparacao = null`), com o aviso
   * `COMPARACAO_SEM_CORTE_EM_D_MAIS_N`. Ausente/`null` = nada a declarar.
   */
  comparacaoSemDelta?: { funnelId: string; nome: string; salvoEm: string } | null;
}

/** Versões FIXAS (AC5) — as da referência-mestre. */
export const CHART_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
export const DATALABELS_URL =
  "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js";

/** Rótulo do espaço reservado aos textos da IA (49.7). */
export const AVISO_RESERVA_IA =
  "Texto analítico escrito pela IA (Story 49.7) — reservado. Até lá, este bloco mostra só leituras determinísticas derivadas do payload, sem adjetivo de magnitude.";

/** Seções numeradas, na ordem canônica do §4 do padrão (00 → 17). */
export const SECOES_DO_DEBRIEFING = [
  "Definições",
  "Resumo Executivo",
  "Diferenças de Valores e Taxas",
  "Evolução Diária",
  "Desempenho por Canal",
  "ROAS",
  "Principais Pontos & Recomendações",
  "Mídia Paga — Visão Geral",
  "Quente × Frio",
  "Vendas do Principal",
  "Order Bump",
  "Cross-launch & Listas",
  "Qualificação",
  "Captação por Faixa",
  "Conversão por Faixa",
  "Criativo × Faixa",
  "Respostas & Padrões",
  "Base de Conhecimento",
] as const;

// ---------------------------------------------------------------------------
// CSS da referência (§1/§2 do padrão) — paleta, fontes e classes canônicas
// ---------------------------------------------------------------------------

export const CSS_DO_DEBRIEFING = `:root{--bg:#121212;--card:#1a1a1a;--card2:#1f1f1f;--line:#2e2e2e;--cream:#f0eeea;--muted:#928e87;
--gold:#fdcf2b;--green:#00bc7d;--teal:#00bba7;--orange:#fe9a00;--purple:#8e51ff;--red:#fb5d5d;--blue:#4d9fff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--cream);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55}
.wrap{max-width:1160px;margin:0 auto;padding:0 22px 90px}
header{padding:42px 0 14px}
.brand{display:flex;align-items:center;gap:11px;margin-bottom:20px}
.logo{width:32px;height:32px;background:var(--cream);color:#121212;font-weight:800;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:18px}
.brand .nm{font-weight:600;font-size:14px}.brand .nm span{color:var(--muted);font-weight:400}
.eyebrow{color:var(--gold);font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:12px}
h1{font-size:31px;line-height:1.1;font-weight:700;letter-spacing:-1px;margin-bottom:12px}h1 b{color:var(--gold)}
.sub{color:var(--muted);font-size:14.5px;max-width:760px}
.legendpg{display:flex;gap:16px;margin-top:16px;font-size:12.5px;flex-wrap:wrap}
.legendpg span{display:flex;align-items:center;gap:6px;color:var(--muted)}
.dot{width:11px;height:11px;border-radius:3px;display:inline-block}
.datestrip{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.datestrip .dcol{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.datestrip .dh{font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px}
.datestrip span{display:block;font-size:12px;color:var(--muted);margin:2px 0}.datestrip b{color:var(--cream)}
@media(max-width:860px){.datestrip{grid-template-columns:1fr}}
.nav{position:sticky;top:0;z-index:20;background:rgba(18,18,18,.93);display:flex;gap:8px;flex-wrap:wrap;padding:13px 0;margin:12px 0 6px;border-bottom:1px solid var(--line)}
.nav button{background:var(--card);border:1px solid var(--line);color:var(--muted);border-radius:9px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
.nav button.on{background:rgba(253,207,43,.13);color:var(--gold);border-color:rgba(253,207,43,.45)}
.tab{display:none}.tab.on{display:block}
section{padding:32px 0;border-bottom:1px solid var(--line)}
.sec-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
.sec-num{color:var(--gold);font-size:13px;font-weight:700}
h2{font-size:22px;font-weight:700;letter-spacing:-.5px}
h3.gr{font-size:13px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin:22px 0 10px}
h3.cap{font-size:15px;font-weight:600;margin:2px 0 4px}
.sec-desc{color:var(--muted);font-size:14px;margin-bottom:18px;max-width:790px}
.defbox{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 18px;margin-bottom:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.defbox .d{border-left:3px solid var(--gold);padding-left:11px}.defbox .d.b2{border-color:var(--teal)}.defbox .d.b3{border-color:var(--orange)}
.defbox .dt{font-size:13px;font-weight:700;margin-bottom:3px}.defbox .dd{font-size:12.5px;color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 15px}
.kpi .lbl{color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px}
.twin{display:flex;gap:10px}.twin>div{flex:1}
.twin .tg{font-size:9.5px;color:var(--muted);display:block;font-weight:700;letter-spacing:.5px}
.twin .tg.pg2{color:var(--gold)}.twin b{font-size:18px;font-weight:700;letter-spacing:-.5px}
.single b{font-size:20px;font-weight:700;letter-spacing:-.5px}
.delta{display:inline-block;margin-top:9px;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:6px}
.up{background:rgba(0,188,125,.13);color:var(--green)}.down{background:rgba(251,93,93,.13);color:var(--red)}.neu{background:rgba(146,142,135,.15);color:var(--muted)}
.tnote{color:var(--muted);font-size:11px;margin-top:6px}
.tbl-wrap{border:1px solid var(--line);border-radius:12px;overflow:hidden;overflow-x:auto}
.tbl-wrap.scroll{max-height:520px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 13px;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
thead th{background:var(--gold);color:#121212;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;position:sticky;top:0}
tbody tr{border-top:1px solid var(--line);background:var(--card)}tbody tr:nth-child(even){background:var(--card2)}
tbody tr.tot{background:#242424;font-weight:700}tbody tr.tot td{color:var(--gold)}
td .g{color:var(--green);font-weight:700}td .r{color:var(--red);font-weight:700}td .y{color:var(--gold);font-weight:700}
.grp td{background:#242424;color:var(--gold);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.chart-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 12px}
.chart-card h3{font-size:14px;font-weight:600;margin-bottom:3px}.chart-card p{color:var(--muted);font-size:12px;margin-bottom:12px}
.chart-box{position:relative;height:250px}.full{grid-column:1/-1}.tall{height:300px}
.chart-box .sem-grafico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;text-align:center;padding:12px}
.insight{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:16px 18px;margin-bottom:11px}
.insight h4{font-size:15.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.tag{font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;letter-spacing:.4px;text-transform:uppercase}
.t-bad{background:rgba(251,93,93,.13);color:var(--red)}.t-good{background:rgba(0,188,125,.13);color:var(--green)}.t-watch{background:rgba(253,207,43,.13);color:var(--gold)}
.insight p{color:#cfccc6;font-size:13.5px}.insight p b{color:var(--cream)}
.note{background:rgba(253,207,43,.07);border:1px solid rgba(253,207,43,.25);border-radius:10px;padding:12px 15px;font-size:12.5px;color:#e7dcb8;margin:13px 0}.note b{color:var(--gold)}
.warn{background:rgba(251,146,60,.08);border:1px solid rgba(254,154,0,.3);border-radius:10px;padding:12px 15px;font-size:12.5px;color:#fdd9a8;margin:13px 0}.warn b{color:var(--orange)}
.warn ul,.note ul{margin:6px 0 0 18px}
.recs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rec{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.rec .n{width:25px;height:25px;border-radius:7px;background:var(--gold);color:#121212;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px;margin-bottom:9px}
.rec h4{font-size:14px;margin-bottom:5px}.rec p{color:var(--muted);font-size:12.5px}
.notes-list{list-style:none}.notes-list li{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--teal);border-radius:9px;padding:12px 15px;margin-bottom:8px;font-size:13.5px}.notes-list li b{color:var(--gold)}
.k-block{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:16px 18px;margin-bottom:11px;font-size:13px;color:#cfccc6}
.k-block h4{color:var(--cream);font-size:14px;margin-bottom:7px}.k-block code{background:#242424;padding:1px 6px;border-radius:4px;color:var(--teal);font-size:12px}
a{color:var(--teal)}
footer{padding:28px 0 0;color:var(--muted);font-size:12px;text-align:center}
@media(max-width:860px){.kpis{grid-template-columns:1fr 1fr}.chart-grid,.recs,.defbox{grid-template-columns:1fr}h1{font-size:26px}}`;

// ---------------------------------------------------------------------------
// Formatação (pt-BR) — `null` sempre vira "—", nunca 0 (AC10)
// ---------------------------------------------------------------------------

type Unidade = "moeda" | "inteiro" | "pct" | "fracao" | "roas";

const TRACO = "—";

function fmt(v: number | null | undefined, u: Unidade, casas?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return TRACO;
  switch (u) {
    case "moeda":
      return moedaBr(v, casas ?? 2);
    case "inteiro":
      return inteiroBr(v);
    case "pct":
      return pctBr(v, casas ?? 1);
    case "fracao":
      return pctBr(v * 100, casas ?? 1);
    case "roas":
      return numeroBr(v, casas ?? 2);
  }
}

/** Valor em pontos percentuais para Δpp (pct já em %, fração ×100). */
function emPct(v: number, u: Unidade): number {
  return u === "fracao" ? v * 100 : v;
}

/** `+1,2 pp` / `−0,4 pp` — Δ de taxa (AC7: Δpp nos lugares certos). */
function ppComSinal(a: number, b: number, u: Unidade): string {
  const d = emPct(b, u) - emPct(a, u);
  const abs = Math.abs(d).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (d > 0) return `+${abs} pp`;
  if (d < 0) return `−${abs} pp`;
  return "0,0 pp";
}

/** Diferença absoluta com sinal na unidade do indicador (coluna "Diferença"). */
function diferencaComSinal(a: number, b: number, u: Unidade, casas?: number): string {
  if (u === "pct" || u === "fracao") return ppComSinal(a, b, u);
  const d = b - a;
  const corpo = fmt(Math.abs(d), u, casas);
  if (d > 0) return `+${corpo}`;
  if (d < 0) return `−${corpo}`;
  return corpo;
}

const esc = escaparHtml;

/** Célula com "—" explicado (title = motivo) quando a métrica é nula. */
function celulaMetrica(m: Pick<Metrica, "valor" | "motivo"> | null | undefined, u: Unidade, casas?: number): string {
  if (!m || m.valor === null || m.valor === undefined) {
    const motivo = m?.motivo ? ` title="${esc(m.motivo)}"` : "";
    return `<span${motivo}>${TRACO}</span>`;
  }
  return esc(fmt(m.valor, u, casas));
}

function utmCurta(u: Utm | null | undefined): string {
  if (!u) return TRACO;
  const partes = [u.source, u.medium, u.campaign, u.term].map((x) => (x ? String(x) : "∅"));
  return partes.every((p) => p === "∅") ? TRACO : partes.join(" / ");
}

const ROTULO_DIMENSAO: Readonly<Record<string, string>> = {
  faixa: "Faixa (lead score)",
  idade: "Idade",
  sexo: "Sexo",
  estado_civil: "Estado civil",
  escolaridade: "Escolaridade",
  renda: "Renda",
  profissao: "Profissão",
  setor: "Setor",
  funcionarios: "Funcionários",
  religiao: "Religião",
};

const ROTULO_PAPEL: Readonly<Record<string, string>> = {
  "leads-captacao": "captação (leads)",
  "vendas-captacao": "captação (vendas)",
  "vendas-principal": "principal",
  "leads-downsell": "downsell (leads)",
  "vendas-downsell": "downsell (vendas)",
  reabertura: "reabertura",
};

/**
 * Situação da venda fora da coorte (QA 49.6 UX-496-1): o documento mostra o
 * rótulo; o código do motor fica no `title`, para quem audita.
 */
const ROTULO_FORA_DA_COORTE: Readonly<Record<string, string>> = {
  SEM_DATA_DO_LEAD: "sem data do lead",
  DATA_DA_VENDA_ILEGIVEL: "data da venda ilegível",
};
const situacaoForaDaCoorte = (motivo: string): string =>
  `<span title="${esc(motivo)}">${esc(ROTULO_FORA_DA_COORTE[motivo] ?? motivo)}</span>`;

const ROTULO_ORIGEM_IMPOSTO: Readonly<Record<string, string>> = {
  stage: "alíquota da etapa",
  project: "alíquota do expert (projeto)",
  default: "alíquota padrão do Loyola",
};

// ---------------------------------------------------------------------------
// Gráficos — tudo num único `const D` (AC5)
// ---------------------------------------------------------------------------

type FormatoDoGrafico = "moeda" | "inteiro" | "pct" | "roas";

interface SerieDoGrafico {
  nome: string;
  dados: (number | null)[];
  cor: string;
}

interface GraficoD {
  tipo: "bar" | "line";
  titulo: string;
  rotulos: string[];
  series: SerieDoGrafico[];
  formato: FormatoDoGrafico;
  horizontal?: boolean;
  empilhado?: boolean;
  /** Linhas verticais (evento, abre/fecha carrinho) — índice no eixo. */
  marcos?: { indice: number; rotulo: string }[];
  /** Data de calendário de cada rótulo — só no tooltip (AC6.1). */
  datas?: string[];
}

const COR = {
  gold: "#fdcf2b",
  cinza: "rgba(146,142,135,.6)",
  green: "#00bc7d",
  teal: "#00bba7",
  orange: "#fe9a00",
  purple: "#8e51ff",
  red: "#fb5d5d",
  blue: "#4d9fff",
} as const;

/** Teto de barras por dimensão na Qualificação (resposta livre tem centenas de valores). */
const MAX_VALORES_NO_GRAFICO = 12;

const CORES_DE_SERIE = [COR.gold, COR.purple, COR.orange, COR.teal, COR.blue, COR.green, COR.red];

/**
 * Script dos gráficos (estático: só lê `D`). Duas peças separadas de propósito:
 * as abas funcionam mesmo se a CDN do Chart.js cair; sem Chart, cada caixa de
 * gráfico diz que ele não carregou (o dado continua na tabela ao lado).
 */
const SCRIPT_DAS_ABAS = `document.querySelectorAll('.nav button').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.nav button').forEach(function(x){x.classList.toggle('on',x===b)});document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('on',t.id==='tab-'+b.getAttribute('data-tab'))});});});`;

const SCRIPT_DOS_GRAFICOS = `(function(){
var CREAM='#f0eeea',MUT='#928e87',LINE='#2e2e2e',GOLD='#fdcf2b';
function semGrafico(msg){Object.keys(D.graficos).forEach(function(id){var c=document.getElementById(id);if(!c)return;var d=document.createElement('div');d.className='sem-grafico';d.textContent=msg;c.parentNode.appendChild(d);c.style.display='none';});}
if(typeof Chart==='undefined'){semGrafico('Gráfico não carregou (biblioteca de gráficos indisponível) — os números estão na tabela desta seção.');return;}
if(typeof ChartDataLabels!=='undefined'){Chart.register(ChartDataLabels);}
Chart.defaults.color=MUT;Chart.defaults.font.family='ui-sans-serif,system-ui,sans-serif';Chart.defaults.font.size=11;
function f(v,fm){if(v===null||v===undefined||!isFinite(v))return '';if(fm==='moeda'){var a=Math.abs(v);return a>=1000?'R$ '+(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'k':'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0});}if(fm==='pct')return v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';if(fm==='roas')return v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});return v.toLocaleString('pt-BR',{maximumFractionDigits:0});}
var marcos={id:'marcos',afterDatasetsDraw:function(c){var m=c.options.plugins&&c.options.plugins.marcos;if(!m||!m.lista)return;var x=c.scales.x,a=c.chartArea,ctx=c.ctx;m.lista.forEach(function(k){var px=x.getPixelForValue(k.indice);ctx.save();ctx.strokeStyle=GOLD;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,a.top);ctx.lineTo(px,a.bottom);ctx.stroke();ctx.fillStyle=GOLD;ctx.font='10px sans-serif';ctx.fillText(k.rotulo,px+3,a.top+10);ctx.restore();});}};
Object.keys(D.graficos).forEach(function(id){var g=D.graficos[id];var el=document.getElementById(id);if(!el)return;
var muitos=g.rotulos.length>16;
var ds=g.series.map(function(s){return {label:s.nome,data:s.dados,backgroundColor:s.cor,borderColor:s.cor,borderRadius:3,borderWidth:g.tipo==='line'?2:0,tension:.25,
datalabels:{color:CREAM,font:{size:muitos?7:9,weight:'700'},anchor:g.empilhado?'center':'end',align:g.empilhado?'center':(g.horizontal?'right':'top'),rotation:(muitos&&!g.horizontal)?-90:0,clamp:true,display:function(c){var v=c.dataset.data[c.dataIndex];return v!==null&&v!==undefined&&v!==0;},formatter:function(v){return f(v,g.formato);}}};});
var eixoV={grid:{color:LINE},stacked:!!g.empilhado,ticks:{callback:function(v){return f(v,g.formato);}}};
var eixoC={grid:{color:LINE},stacked:!!g.empilhado,ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:16}};
new Chart(el,{type:g.tipo,data:{labels:g.rotulos,datasets:ds},plugins:[marcos],options:{animation:false,indexAxis:g.horizontal?'y':'x',responsive:true,maintainAspectRatio:false,layout:{padding:{top:26,right:g.horizontal?48:8}},
plugins:{marcos:{lista:g.marcos||[]},legend:{display:g.series.length>1,labels:{color:CREAM,boxWidth:12,boxHeight:12,usePointStyle:true,pointStyle:'rectRounded',padding:13}},
tooltip:{callbacks:{title:function(it){var i=it[0].dataIndex;return g.datas&&g.datas[i]?g.rotulos[i]+' · '+g.datas[i]:g.rotulos[i];},label:function(c){return c.dataset.label+': '+f(c.raw,g.formato);}}}},
scales:g.horizontal?{x:eixoV,y:eixoC}:{x:eixoC,y:eixoV}}});});
})();`;

// ---------------------------------------------------------------------------
// Peças de HTML
// ---------------------------------------------------------------------------

class Documento {
  private num = 0;
  readonly graficos: Record<string, GraficoD> = {};

  secao(titulo: (typeof SECOES_DO_DEBRIEFING)[number], descricao: string, corpo: string, ultima = false): string {
    const n = String(this.num++).padStart(2, "0");
    return (
      `<section${ultima ? ' style="border-bottom:none"' : ""} data-secao="${esc(titulo)}">` +
      `<div class="sec-head"><span class="sec-num">${n}</span><h2>${esc(titulo)}</h2></div>` +
      (descricao ? `<p class="sec-desc">${descricao}</p>` : "") +
      corpo +
      `</section>`
    );
  }

  grafico(id: string, g: GraficoD, opts: { alto?: boolean; nota?: string; full?: boolean } = {}): string {
    this.graficos[id] = g;
    return (
      `<div class="chart-card${opts.full ? " full" : ""}"><h3>${esc(g.titulo)}</h3>` +
      (opts.nota ? `<p>${opts.nota}</p>` : "") +
      `<div class="chart-box${opts.alto ? " tall" : ""}"><canvas id="${id}"></canvas></div></div>`
    );
  }
}

/** Bloco de lacuna declarada (AC5/AC8): no lugar do gráfico/tabela que faltaria. */
function lacuna(titulo: string, texto: string): string {
  return `<div class="warn" data-lacuna><b>${esc(titulo)}</b> — ${esc(texto)}</div>`;
}

function nota(html: string): string {
  return `<div class="note">${html}</div>`;
}

function tabela(cabecalho: string[], linhas: string[], opts: { rolagem?: boolean; total?: string } = {}): string {
  return (
    `<div class="tbl-wrap${opts.rolagem ? " scroll" : ""}"><table><thead><tr>` +
    cabecalho.map((c) => `<th>${esc(c)}</th>`).join("") +
    `</tr></thead><tbody>${linhas.join("")}${opts.total ?? ""}</tbody></table></div>`
  );
}

function tr(celulas: string[], classe = ""): string {
  return `<tr${classe ? ` class="${classe}"` : ""}>${celulas.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

function insight(titulo: string, tag: { texto: string; boa: boolean }, corpo: string, ia = false): string {
  return (
    `<div class="insight"${ia ? ' data-bloco-ia="leitura"' : ""}><h4>${esc(titulo)} ` +
    `<span class="tag ${tag.boa ? "t-good" : "t-watch"}">${esc(tag.texto)}</span></h4><p>${corpo}</p></div>`
  );
}

function blocoIa(chave: string, conteudo: string): string {
  return `<div data-bloco-ia="${esc(chave)}"><div class="note"><b>Bloco da IA (49.7):</b> ${esc(AVISO_RESERVA_IA)}</div>${conteudo}</div>`;
}

// ---------------------------------------------------------------------------
// Indicadores (KPI gêmeo / valor único + tabela Δ)
// ---------------------------------------------------------------------------

interface Indicador {
  grupo: "Volume" | "Faturamento" | "Mídia" | "Taxas";
  /**
   * Story 49.12 (AC6) — o cálculo depende de venda do principal, reabertura ou
   * downsell: com o carrinho fechado no corte, é lacuna escrita (nunca zero).
   */
  dependeDoCarrinho?: boolean;
  /** Story 49.14 (AC4) — o indicador é do downsell: lacuna quando ele não começou até o corte. */
  doDownsell?: boolean;
  rotulo: string;
  ler: (p: DebriefingPayload) => { valor: number | null; motivo?: string };
  unidade: Unidade;
  casas?: number;
  /** Custo: subir é piorar. */
  menorEhMelhor?: boolean;
  /** Sem avaliação boa/ruim (investimento): só a direção. */
  neutro?: boolean;
  /** Nota de rodapé do KPI (TMB, diferença de fonte…). */
  tnote?: (p: DebriefingPayload) => string | null;
}

const metrica = (m: { valor: number | null; motivo?: string } | null | undefined) => ({
  valor: m?.valor ?? null,
  ...(m?.motivo ? { motivo: m.motivo } : {}),
});
const numero = (v: number | null | undefined) => ({ valor: v ?? null });
const notaTmb = (p: DebriefingPayload) =>
  p.dinheiroTempo.tmb.sinalizado && p.dinheiroTempo.tmb.texto
    ? `s/ TMB — ${p.dinheiroTempo.tmb.texto}`
    : "s/ TMB — nenhuma venda via TMB no período";

export const INDICADORES: readonly Indicador[] = [
  {
    grupo: "Volume",
    rotulo: "Ingressos (compradores de captação únicos)",
    ler: (p) => numero(p.dinheiroTempo.ingressosUnicos),
    unidade: "inteiro",
    tnote: (p) => p.dinheiroTempo.diferencaDeFonte.texto,
  },
  {
    grupo: "Volume",
    rotulo: "Vendas do Produto Principal",
    dependeDoCarrinho: true,
    ler: (p) => numero(p.dinheiroTempo.vendasPrincipal),
    unidade: "inteiro",
    tnote: (p) => `TMB no principal: ${inteiroBr(p.dinheiroTempo.tmb.vendasNoPrincipal)} (contadas, valor não considerado)`,
  },
  { grupo: "Volume", rotulo: "Vendas Order Bump", ler: (p) => numero(p.dinheiroTempo.captacao.vendasPorTipo.order_bump), unidade: "inteiro" },
  { grupo: "Volume", rotulo: "Vendas Combo", ler: (p) => numero(p.dinheiroTempo.captacao.vendasPorTipo.combo), unidade: "inteiro" },
  {
    grupo: "Volume",
    rotulo: "Vendas Downsell",
    dependeDoCarrinho: true,
    doDownsell: true,
    ler: (p) => (p.dinheiroTempo.downsell.aplicavel ? numero(p.dinheiroTempo.downsell.vendas) : { valor: null, motivo: "sem downsell na config" }),
    unidade: "inteiro",
  },
  {
    grupo: "Faturamento",
    rotulo: "Fat. Captação (ingresso + combo + bump) s/ TMB",
    ler: (p) => metrica(p.dinheiroTempo.captacao.faturamentoCaptacao),
    unidade: "moeda",
    tnote: notaTmb,
  },
  { grupo: "Faturamento", rotulo: "Fat. Ingresso s/ TMB", ler: (p) => metrica(p.dinheiroTempo.captacao.faturamentoIngresso), unidade: "moeda" },
  { grupo: "Faturamento", rotulo: "Fat. Order Bump s/ TMB", ler: (p) => metrica(p.dinheiroTempo.captacao.faturamentoOrderBump), unidade: "moeda" },
  { grupo: "Faturamento", rotulo: "Fat. Produto Principal s/ TMB", ler: (p) => metrica(p.dinheiroTempo.faturamentoPrincipal), unidade: "moeda", tnote: notaTmb, dependeDoCarrinho: true },
  {
    grupo: "Faturamento",
    rotulo: "Fat. Total s/ TMB",
    ler: (p) => numero(p.dinheiroTempo.faturamentoTotal),
    unidade: "moeda",
    // QA 49.14 MNT-001: a parcela do downsell que não começou fica no total, mas fora do ROAS total — dito aqui.
    tnote: (p) => {
      const fora = parcelaForaDoRoasTotal(p);
      return fora ? `${notaTmb(p)} · ${fora}` : notaTmb(p);
    },
    dependeDoCarrinho: true,
  },
  { grupo: "Faturamento", rotulo: "Ticket médio da captação", ler: (p) => metrica(p.dinheiroTempo.captacao.ticketCaptacao), unidade: "moeda" },
  {
    grupo: "Mídia",
    rotulo: "Investimento Total Mídia (c/ imposto)",
    ler: (p) => metrica(p.dinheiroTempo.midia.investimentoTotal),
    unidade: "moeda",
    neutro: true,
    menorEhMelhor: true,
  },
  {
    grupo: "Mídia",
    rotulo: "Investimento Captação (c/ imposto)",
    ler: (p) => numero(p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto),
    unidade: "moeda",
    neutro: true,
    menorEhMelhor: true,
  },
  { grupo: "Mídia", rotulo: "Impressões (captação)", ler: (p) => numero(p.dinheiroTempo.midia.porGrupo.captacao.impressoes), unidade: "inteiro" },
  { grupo: "Mídia", rotulo: "Cliques no link (captação)", ler: (p) => numero(p.dinheiroTempo.midia.porGrupo.captacao.linkClicks), unidade: "inteiro" },
  { grupo: "Mídia", rotulo: "CTR (link) — captação", ler: (p) => metrica(p.dinheiroTempo.midia.porGrupo.captacao.ctr), unidade: "pct", casas: 2 },
  { grupo: "Mídia", rotulo: "CPC (link) — captação", ler: (p) => metrica(p.dinheiroTempo.midia.porGrupo.captacao.cpc), unidade: "moeda", menorEhMelhor: true },
  { grupo: "Mídia", rotulo: "CPM — captação", ler: (p) => metrica(p.dinheiroTempo.midia.porGrupo.captacao.cpm), unidade: "moeda", menorEhMelhor: true },
  { grupo: "Mídia", rotulo: "ROAS só ingresso", ler: (p) => metrica(p.dinheiroTempo.roasSoIngresso), unidade: "roas" },
  { grupo: "Mídia", rotulo: "ROAS Captação (ingresso + combo + bump)", ler: (p) => metrica(p.dinheiroTempo.roasCaptacao), unidade: "roas" },
  {
    grupo: "Mídia",
    rotulo: "ROAS Total s/ TMB (fat ÷ invest total)",
    dependeDoCarrinho: true,
    ler: (p) => metrica(p.dinheiroTempo.roasTotalSemTmb),
    unidade: "roas",
    tnote: (p) => notaDoRoasTotal(p),
  },
  { grupo: "Taxas", rotulo: "Conversão Ingresso → Principal", ler: (p) => metrica(p.dinheiroTempo.conversaoIngressoPrincipal), unidade: "fracao", casas: 2, dependeDoCarrinho: true },
  { grupo: "Taxas", rotulo: "% Compradores / Cliques", ler: (p) => metrica(p.dinheiroTempo.captacao.pctCompradoresPorCliques), unidade: "pct", casas: 2 },
  { grupo: "Taxas", rotulo: "% compradores c/ combo ou order bump", ler: (p) => metrica(p.dinheiroTempo.captacao.comTierSuperior), unidade: "fracao" },
  { grupo: "Taxas", rotulo: "% A+B (respondentes)", ler: (p) => metrica(p.publico.faixa.pctAB), unidade: "pct" },
  { grupo: "Taxas", rotulo: "Taxa de resposta da pesquisa", ler: (p) => metrica(p.publico.taxaDeResposta), unidade: "pct" },
];

const ehTaxa = (u: Unidade) => u === "pct" || u === "fracao";

// ---------------------------------------------------------------------------
// Story 49.12 — corte (parcial / comparação em D+N) e lacuna do carrinho
// ---------------------------------------------------------------------------

/** O corte que deixa o carrinho de fora deste payload (AC6), ou `null`. */
function semCarrinho(pp: DebriefingPayload): CorteDaJanela | null {
  return corteSemCarrinho(pp.dinheiroTempo.janela);
}

/** A lacuna escrita do carrinho deste payload ("carrinho ainda não abriu — dados até 06/10, D+6"), ou `null`. */
function lacunaDoCarrinho(pp: DebriefingPayload): string | null {
  const c = semCarrinho(pp);
  return c ? textoDaLacunaDoCarrinho(c) : null;
}

/** Algum dos dois lados tem corte — só aí as notas de Δ "—" da 49.12 aparecem (o encerrado fica igual). */
function temCorte(p: DebriefingPayload, comp: ComparacaoDoDebriefing | null): boolean {
  return !!p.dinheiroTempo.janela.corte || !!comp?.payload.dinheiroTempo.janela.corte;
}

/** O valor do indicador, com a lacuna do carrinho no lugar do número quando ele depende do carrinho (AC6). */
function lerIndicador(ind: Indicador, pp: DebriefingPayload): { valor: number | null; motivo?: string } {
  const lac = ind.dependeDoCarrinho ? lacunaDoCarrinho(pp) : null;
  if (lac) return { valor: null, motivo: lac };
  // 49.14 (AC2/AC4): o downsell que não começou até o corte é lacuna escrita, nunca zero.
  const dsl = ind.doDownsell ? lacunaDoDownsell(pp) : null;
  return dsl ? { valor: null, motivo: dsl } : ind.ler(pp);
}

// ---------------------------------------------------------------------------
// Story 49.14 — carrinho aberto: fases em curso (parciais) e não começadas
// ---------------------------------------------------------------------------

/** As fases no corte deste payload, quando o carrinho já abriu (49.14), ou `null`. */
function fasesAbertas(pp: DebriefingPayload): { corte: CorteDaJanela; fases: NonNullable<CorteDaJanela["fases"]> } | null {
  return fasesComCarrinhoAberto(pp.dinheiroTempo.janela);
}

/** "downsell ainda não começou — dados até 06/10, D+6" (AC4), ou `null`. */
function lacunaDoDownsell(pp: DebriefingPayload): string | null {
  const f = fasesAbertas(pp);
  return f && f.fases.downsell.estado === "nao-comecou" ? textoDaFaseQueNaoComecou("downsell", f.corte) : null;
}

/** "reabertura ainda não começou — dados até 06/10, D+6" (AC4), ou `null`. */
function lacunaDaReabertura(pp: DebriefingPayload): string | null {
  const f = fasesAbertas(pp);
  return f && f.fases.reabertura.estado === "nao-comecou" ? textoDaFaseQueNaoComecou("reabertura", f.corte) : null;
}

/** O rótulo "parcial — …" de uma fase em curso no corte (AC3/AC4), ou `null`. */
function parcialDaFase(pp: DebriefingPayload, fase: "carrinho" | "reabertura" | "downsell"): string | null {
  const f = fasesAbertas(pp);
  return f && f.fases[fase].estado === "em-curso" ? textoDaFaseEmCurso(fase, f.corte) : null;
}

/** AC3/AC4 — o rótulo de parcial de um indicador do carrinho (o do downsell, se ele estiver em curso). */
function rotuloParcialDoIndicador(ind: Indicador, pp: DebriefingPayload): string | null {
  if (!ind.dependeDoCarrinho) return null;
  if (ind.doDownsell) return parcialDaFase(pp, "downsell");
  return parcialDaFase(pp, "carrinho");
}

/**
 * QA 49.14 MNT-001 — com o downsell que não começou e venda da etapa de
 * downsell datada antes do início dele: a parcela que está no Fat. Total e fora
 * do ROAS total, com a conta que fecha ("Fat. Total − parcela ÷ investimento").
 * `null` quando não há parcela (Fat. Total ÷ investimento já é o ROAS total).
 */
function parcelaForaDoRoasTotal(pp: DebriefingPayload): string | null {
  const mt = pp.dinheiroTempo;
  const d = mt.roasTotalSemTmb.downsellNoCorte;
  const fora = d?.estado === "nao-comecou" ? (d.faturamentoFora ?? mt.roasTotalSemTmb.decomposicao.downsell) : 0;
  if (!(fora > 0)) return null;
  return (
    `inclui ${fmt(fora, "moeda")} de venda(s) da etapa de downsell datada(s) antes do início dele, que ficam FORA do ROAS total (o downsell ainda não começou): ` +
    `ROAS total = (Fat. Total ${fmt(mt.faturamentoTotal, "moeda")} − ${fmt(fora, "moeda")}) ÷ investimento total ${fmt(mt.roasTotalSemTmb.denominador, "moeda")}`
  );
}

/** A nota do ROAS total: a decisão 5 de sempre; com corte, o que aconteceu com o downsell (AC4). */
function notaDoRoasTotal(pp: DebriefingPayload): string {
  const d = pp.dinheiroTempo.roasTotalSemTmb.downsellNoCorte;
  if (d?.estado === "nao-comecou") {
    const fora = parcelaForaDoRoasTotal(pp);
    return `${d.texto} — o numerador é captação + principal (o downsell entra quando começar; decisão 5 do dono)${fora ? `; o Fat. Total ${fora}` : ""}`;
  }
  if (d?.estado === "em-curso") return `inclui o downsell no numerador (decisão 5 do dono) — ${d.texto}`;
  return "inclui o downsell no numerador (decisão 5 do dono)";
}

/** AC4 — a parcela do downsell no numerador do ROAS total, por extenso (fora / parcial / o valor). */
function parcelaDoDownsell(rt: DebriefingPayload["dinheiroTempo"]["roasTotalSemTmb"]): string {
  const d = rt.downsellNoCorte;
  if (d?.estado === "nao-comecou") {
    // MNT-001: a parcela que está no faturamento total e fora deste numerador, por extenso.
    const fora = d.faturamentoFora ?? rt.decomposicao.downsell;
    return (
      `<span data-downsell-fora>downsell FORA (${esc(d.texto)})` +
      (fora > 0 ? `; ${esc(fmt(fora, "moeda"))} de venda(s) da etapa de downsell datada(s) antes do início dele estão no Fat. Total e fora deste numerador` : "") +
      `</span>`
    );
  }
  const valor = `downsell ${esc(fmt(rt.decomposicao.downsell, "moeda"))}`;
  return d?.estado === "em-curso" ? `${valor} <span data-parcial-da-fase>(${esc(d.texto)})</span>` : valor;
}

/** AC3/AC4 — o que o aviso do topo diz das fases com o carrinho aberto (vazio sem corte ou com o carrinho fechado). */
function avisoDasFases(pp: DebriefingPayload): string {
  const f = fasesAbertas(pp);
  if (!f) return "";
  const { corte, fases } = f;
  const frases: string[] = [];
  if (fases.carrinho.estado === "em-curso") {
    frases.push(
      `<b>O carrinho está aberto (${esc(textoDaFaseNoCorte(fases, corte.dia))}):</b> vendas do principal, faturamento, conversão, coorte e ROAS do principal e total saem como ` +
        `“${esc(textoDaFaseEmCurso("carrinho", corte))}”, e a coorte está incompleta (leads recentes ainda não tiveram tempo de comprar).`,
    );
  } else {
    frases.push(`<b>Fase no corte:</b> ${esc(textoDaFaseNoCorte(fases, corte.dia))}.`);
  }
  for (const nome of ["reabertura", "downsell"] as const) {
    const e = fases[nome].estado;
    if (e === "nao-comecou") {
      frases.push(
        nome === "downsell"
          ? `O downsell ainda não começou: fica fora do ROAS total (dito na métrica) e aparece como lacuna escrita, nunca como zero.`
          : `A reabertura ainda não começou: o apêndice dela é lacuna escrita, nunca zero.`,
      );
    } else if (e === "em-curso") {
      frases.push(`${nome === "downsell" ? "O downsell" : "A reabertura"} está em curso: entra com os dados até o corte (“${esc(textoDaFaseEmCurso(nome, corte))}”).`);
    }
  }
  return `${frases.join(" ")} `;
}

/** AC5 — "PG04 em D+28: 5º dia de carrinho" (a fase da comparação no corte dela), ou `null`. */
function faseDaComparacao(comp: ComparacaoDoDebriefing | null): string | null {
  const c = comp?.payload.dinheiroTempo.janela.corte;
  return comp && c?.fases ? `${comp.nome} em D+${c.dMaisN}: ${textoDaFaseNoCorte(c.fases, c.dia)}` : null;
}

/** "dd/mm/aaaa (D+N dele)" do corte da comparação (AC8), ou `null` se ela não foi cortada. */
function corteDaComparacao(comp: ComparacaoDoDebriefing | null): string | null {
  const c = comp?.payload.dinheiroTempo.janela.corte;
  return c ? `${dataBr(c.dia)} (D+${c.dMaisN} dele)` : null;
}

/** Classe/tag do Δ — derivada do sinal e da direção boa da métrica (AC7). */
function avaliar(ind: Indicador, a: number, b: number): { classe: "up" | "down" | "neu"; boa: boolean | null } {
  const av = avaliacao(a, b, ind.menorEhMelhor ?? false);
  if (ind.neutro || av === "estável") return { classe: "neu", boa: null };
  return av === "melhorou" ? { classe: "up", boa: true } : { classe: "down", boa: false };
}

function textoDoDelta(ind: Indicador, a: number, b: number): string {
  return ehTaxa(ind.unidade) ? ppComSinal(a, b, ind.unidade) : pctComSinal(variacaoPct(a, b));
}

function kpi(ind: Indicador, atual: DebriefingPayload, nomeAtual: string, comp: ComparacaoDoDebriefing | null): string {
  const va = lerIndicador(ind, atual);
  // 49.12: a nota de rodapé de um indicador em lacuna mostraria um zero (ex.: "TMB no principal: 0").
  const nota = ind.dependeDoCarrinho && lacunaDoCarrinho(atual) ? null : (ind.tnote?.(atual) ?? null);
  const motivoNulo = va.valor === null && va.motivo ? `— = ${va.motivo}` : null;
  // 49.14 (AC3/AC4): número de fase em curso sai rotulado como parcial.
  const parcialDoInd = va.valor !== null ? rotuloParcialDoIndicador(ind, atual) : null;
  const notas =
    [nota, motivoNulo].filter(Boolean).map((n) => `<div class="tnote">${esc(n)}</div>`).join("") +
    (parcialDoInd ? `<div class="tnote" data-parcial-da-fase>${esc(parcialDoInd)}</div>` : "");
  if (!comp) {
    return (
      `<div class="kpi"><div class="lbl">${esc(ind.rotulo)}</div>` +
      `<div class="single"><b>${esc(fmt(va.valor, ind.unidade, ind.casas))}</b></div>${notas}</div>`
    );
  }
  const vb = lerIndicador(ind, comp.payload);
  let delta = `<div class="delta neu">${TRACO}</div>`;
  if (va.valor !== null && vb.valor !== null) {
    const { classe } = avaliar(ind, vb.valor, va.valor);
    delta = `<div class="delta ${classe}">${seta(vb.valor, va.valor)} ${esc(textoDoDelta(ind, vb.valor, va.valor))}</div>`;
  } else if (temCorte(atual, comp) && (va.valor === null) !== (vb.valor === null)) {
    // 49.12 (AC8): a métrica existe de um lado e é lacuna do outro — Δ "—" com nota, nunca inventado.
    const lado = va.valor === null ? { nome: nomeAtual, m: va } : { nome: comp.nome, m: vb };
    delta += `<div class="tnote" data-delta-lacuna>Δ — : sem o número de ${esc(lado.nome)}${lado.m.motivo ? ` (${esc(lado.m.motivo)})` : ""}</div>`;
  }
  return (
    `<div class="kpi"><div class="lbl">${esc(ind.rotulo)}</div><div class="twin">` +
    `<div><span class="tg">${esc(comp.nome)}</span><b>${esc(fmt(vb.valor, ind.unidade, ind.casas))}</b></div>` +
    `<div><span class="tg pg2">${esc(nomeAtual)}</span><b>${esc(fmt(va.valor, ind.unidade, ind.casas))}</b></div>` +
    `</div>${delta}${notas}</div>`
  );
}

// ---------------------------------------------------------------------------
// Datas-chave e eixo D+n
// ---------------------------------------------------------------------------

function d0(p: DebriefingPayload): string {
  return p.config.datasChave.inicioCaptacao;
}

function dMais(p: DebriefingPayload, dia: string): number {
  return diasEntre(d0(p), dia);
}

function rotuloD(n: number): string {
  return n === 0 ? "D0" : n > 0 ? `D+${n}` : `D${n}`;
}

function marcosDoLancamento(p: DebriefingPayload): { indice: number; rotulo: string }[] {
  const dc = p.config.datasChave;
  const m: { dia: string | null; rotulo: string }[] = [
    { dia: dc.aberturaCarrinho, rotulo: "abre carrinho" },
    { dia: dc.fimCarrinho, rotulo: "fecha carrinho" },
  ];
  if (dc.reabertura?.houve) m.push({ dia: dc.reabertura.abertura, rotulo: "reabertura" });
  if (dc.downsell?.houve) m.push({ dia: dc.downsell.abertura, rotulo: "downsell" });
  // 49.12 (AC6): com corte, só os marcos que aconteceram até ele — na parcial com
  // o carrinho fechado, nenhum ("ainda não aconteceu" e data futura não viram linha).
  const corte = p.dinheiroTempo.janela.corte?.dia;
  return m
    .filter((x): x is { dia: string; rotulo: string } => x.dia !== null && (corte === undefined || x.dia <= corte))
    .map((x) => ({ indice: dMais(p, x.dia), rotulo: x.rotulo }));
}

/** "ainda não aconteceu" (49.12 AC2) — diferente de "não houve" no documento. */
const AINDA_NAO_ACONTECEU = "ainda não aconteceu";

function datasChaveHtml(p: DebriefingPayload, nome: string): string {
  const dc = p.config.datasChave;
  const linha = (rot: string, dia: string | null) =>
    dia === null
      ? `<span>${esc(rot)}: <b>${AINDA_NAO_ACONTECEU}</b></span>`
      : `<span>${esc(rot)} <b>${esc(diaMesBr(dia))} · ${rotuloD(dMais(p, dia))}</b></span>`;
  const extra = (rot: string, r: typeof dc.reabertura, comFimD: boolean) =>
    r === null
      ? `<span>${rot}: <b>${AINDA_NAO_ACONTECEU}</b></span>`
      : r.houve
        ? `<span>${rot} <b>${esc(diaMesBr(r.abertura))} · ${rotuloD(dMais(p, r.abertura))}</b> · fim <b>${esc(diaMesBr(r.fim))}${comFimD ? ` · ${rotuloD(dMais(p, r.fim))}` : ""}</b></span>`
        : `<span>${rot}: <b>não houve</b></span>`;
  const partes = [
    linha("Início da captação", dc.inicioCaptacao),
    linha("Abertura carrinho principal", dc.aberturaCarrinho),
    linha("Fim carrinho principal", dc.fimCarrinho),
    extra("Reabertura", dc.reabertura, false),
    extra("Downsell", dc.downsell, true),
  ];
  // 49.12: o corte da janela (a parcial, ou a comparação cortada no mesmo D+N — AC8).
  const corte = p.dinheiroTempo.janela.corte;
  if (corte) {
    partes.push(
      `<span data-corte="${esc(corte.motivo)}">${corte.motivo === "lancamento-em-andamento" ? "Dados até (corte)" : "Comparação cortada em"} <b>${esc(diaMesBr(corte.dia))} · ${rotuloD(corte.dMaisN)}</b></span>`,
    );
    // 49.14 (AC2/AC5): a fase em que o lançamento estava no corte.
    if (corte.fases) partes.push(`<span data-fase-no-corte>Fase em ${rotuloD(corte.dMaisN)}: <b>${esc(textoDaFaseNoCorte(corte.fases, corte.dia))}</b></span>`);
    // 49.14 (AC6, R9-5): todas as fases concluídas — a janela terminou no fim da regra 2A.
    if (corte.motivo === "lancamento-em-andamento" && corte.todasAsFasesConcluidas) {
      const fim = p.dinheiroTempo.janela.fim;
      partes.push(`<span data-janela-terminou>Janela terminou em <b>${esc(diaMesBr(fim))} · ${rotuloD(dMais(p, fim))}</b> (fim da regra 2A)</span>`);
    }
  }
  return `<div class="dcol"><div class="dh">${esc(nome)} — datas-chave</div>${partes.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Composição da comparação / série histórica (49.11 AC9)
// ---------------------------------------------------------------------------

interface ItemDaSerie {
  funnelId: string;
  nome: string;
  posicao: number;
  principal: boolean;
}

/** A lista EFETIVA de comparação, na ordem, com nomes (do payload; a principal é a 1ª). */
function composicaoDaComparacao(input: DebriefingRenderInput): ItemDaSerie[] {
  const daSerie = input.payload.publico.serieHistorica?.lancamentos;
  if (daSerie && daSerie.length > 0) {
    return daSerie.map((l) => ({
      funnelId: l.funnelId,
      nome: l.nome ?? input.rotulos.funis[l.funnelId] ?? l.funnelId,
      posicao: l.posicao,
      principal: l.principal,
    }));
  }
  const lista = input.payload.config.lancamentosComparacao ??
    (input.payload.config.lancamentoComparacaoFunnelId ? [input.payload.config.lancamentoComparacaoFunnelId] : []);
  return lista.map((id, i) => ({
    funnelId: id,
    nome: (input.comparacao?.funnelId === id ? input.comparacao.nome : null) ?? input.rotulos.funis[id] ?? id,
    posicao: i + 1,
    principal: i === 0,
  }));
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderDebriefing(input: DebriefingRenderInput): string {
  const { payload: p, comparacao: comp, rotulos } = input;
  const mt = p.dinheiroTempo;
  const pub = p.publico;
  const A = rotulos.lancamento;
  const doc = new Documento();
  const etapa = (id: string) => rotulos.etapas[id] ?? id;
  const lacunaDe = (codigo: string) => p.lacunas.find((l) => l.codigo === codigo) ?? null;
  const composicao = composicaoDaComparacao(input);
  // 49.12 — a parcial (lançamento em andamento) e a lacuna do carrinho deste payload.
  const parcial = parcialDo(p);
  const lacCarrinho = lacunaDoCarrinho(p);
  const semDelta = input.comparacaoSemDelta ?? null;
  const rotuloParcial = parcial ? `dados até ${diaMesBr(parcial.corte)} · D+${parcial.dMaisN}` : "";

  // ---- Header ----
  const titulo = parcial
    ? comp
      ? `Debriefing Comparativo PARCIAL <b>${esc(A)}</b> × <b>${esc(comp.nome)}</b> · ${esc(rotuloParcial)}`
      : `Debriefing PARCIAL — <b>${esc(A)}</b> (${esc(rotulos.projeto)}) · ${esc(rotuloParcial)}`
    : comp
      ? `Debriefing Comparativo <b>${esc(A)}</b> × <b>${esc(comp.nome)}</b>`
      : `Debriefing — <b>${esc(A)}</b> (${esc(rotulos.projeto)}) · edição única`;
  const legenda = comp
    ? `<div class="legendpg"><span><span class="dot" style="background:#928e87"></span> <b>${esc(comp.nome)}</b> · comparação principal · início ${esc(diaMesBr(d0(comp.payload)))}</span>` +
      `<span><span class="dot" style="background:var(--gold)"></span> <b>${esc(A)}</b> · início ${esc(diaMesBr(d0(p)))}</span></div>`
    : "";
  const datestrip =
    `<div class="datestrip">${comp ? datasChaveHtml(comp.payload, comp.nome) : ""}${datasChaveHtml(p, A)}</div>` +
    `<p class="tnote">Datas-chave informadas pelo usuário no formulário da configuração do debriefing — não são lidas de fonte (lacuna declarada). D0 = início da captação.</p>`;
  const header =
    `<header><div class="brand"><span class="logo">X</span><span class="nm">Loyola X · <span>Debriefing</span></span></div>` +
    `<div class="eyebrow">Debriefing de Tráfego &amp; Growth</div><h1>${titulo}</h1>` +
    `<p class="sub">Expert <b>${esc(rotulos.projeto)}</b> · janela ${esc(dataBr(mt.janela.inicio))} a ${esc(dataBr(mt.janela.fim))} · gerado em ${esc(dataBr(p.geradoEm.slice(0, 10)))}. ` +
    `Fontes: planilhas de vendas e pesquisa do Loyola, mídia Meta do banco (custo c/ imposto, cliques = link clicks).</p>` +
    `${legenda}${datestrip}</header>`;

  // ---- 49.12 (AC7) — aviso de lançamento em andamento, no topo ----
  const avisoParcial = parcial
    ? parcial.todasAsFasesConcluidas
      ? // 49.14 (AC6, R9-5): todas as fases concluídas — a janela é a do final, e o documento continua parcial.
        `<div class="warn" data-parcial data-fases-concluidas><b>Lançamento em andamento — documento PARCIAL.</b> Corte em <b>${esc(dataBr(parcial.corte))}</b> ` +
        `(ontem, no fuso de Brasília) · <b>D+${esc(String(parcial.dMaisN))}</b> da captação (D0 = ${esc(dataBr(parcial.janela.inicio))}). ` +
        `<b>Todas as fases (carrinho, reabertura e downsell) terminaram até o corte:</b> a janela terminou em <b>${esc(dataBr(parcial.janela.fim))}</b> (fim da regra 2A) ` +
        `e os números são os do relatório final — mídia e vendas depois desse dia não entram. ` +
        `Marque “encerrado” na configuração do debriefing para gerar o relatório final, que substitui esta parcial.</div>`
      : `<div class="warn" data-parcial><b>Lançamento em andamento — documento PARCIAL.</b> Dados até <b>${esc(dataBr(parcial.corte))}</b> ` +
        `(ontem, no fuso de Brasília) · <b>D+${esc(String(parcial.dMaisN))}</b> da captação (D0 = ${esc(dataBr(parcial.janela.inicio))}). ` +
        `Nada depois do corte entra em número nenhum. ` +
        (lacCarrinho
          ? `O carrinho ainda não abriu: o que depende de venda do principal, reabertura ou downsell aparece como lacuna escrita, nunca como zero. `
          : "") +
        avisoDasFases(p) +
        `A próxima geração substitui este documento; quando o lançamento terminar, gere como encerrado.</div>`
    : "";

  // ---- Banner de alertas e avisos (AC7) ----
  const avisos: DebriefingAviso[] = p.config.avisos ?? [];
  const extras: string[] = [];
  // R7-7: Δ contra o último payload SALVO da comparação (sem config dela) — sempre à vista.
  // 49.12 (AC8, R8-3): parcial × comparação só com payload salvo → sem Δ, com aviso.
  if (semDelta) {
    extras.push(
      `<li data-aviso="${AVISO_COMPARACAO_SEM_CORTE_EM_D_MAIS_N}"><b>${AVISO_COMPARACAO_SEM_CORTE_EM_D_MAIS_N}</b> — o documento sai <b>sem Δ</b> contra <b>${esc(semDelta.nome)}</b>: ` +
        `ele não tem config de debriefing liberada e o único dado dele é o relatório salvo em ${esc(dataBr(diaBrtDe(semDelta.salvoEm)))}, que tem os totais fechados ` +
        `e não pode ser cortado no mesmo D+N desta parcial. Para comparar, configure (e valide) o debriefing na etapa Debriefing dele e gere de novo.</li>`,
    );
  }
  if (comp && comp.origem.tipo === "payload-salvo") {
    extras.push(
      `<li data-aviso="${AVISO_COMPARACAO_DE_PAYLOAD_SALVO}"><b>${AVISO_COMPARACAO_DE_PAYLOAD_SALVO}</b> — o Δ contra <b>${esc(comp.nome)}</b> usa o último debriefing salvo dele ` +
        `(gerado em ${esc(dataBr(diaBrtDe(comp.origem.salvoEm)))}), não um recálculo: ${esc(comp.origem.motivo)}. ` +
        `Números de ${esc(comp.nome)} ficam como estavam naquela geração. Para recalcular, configure (e valide) o debriefing na etapa Debriefing dele e gere de novo.</li>`,
    );
  }
  // R7-6: produto novo fora do mapa na captação — alerta, não bloqueio (o F14 da 49.5 já bloqueia o ambíguo).
  const foraDoMapa = mt.produtosNaoClassificados;
  if (foraDoMapa.length > 0) {
    extras.push(
      `<li data-alerta="${ALERTA_PRODUTO_FORA_DO_MAPA}"><b>${ALERTA_PRODUTO_FORA_DO_MAPA}</b> (${esc(inteiroBr(foraDoMapa.length))}) — ` +
        `produto(s) da captação fora do mapa de produtos, contado(s) pela regra padrão do painel; detalhe em “Principais Pontos &amp; Recomendações”.</li>`,
    );
  }
  const banner =
    input.alertas.length + avisos.length + extras.length > 0
      ? `<div class="warn" data-alertas><b>Sinalizações do gerador (não bloqueiam):</b><ul>` +
        input.alertas.map((a) => `<li><b>${esc(a.codigo)}</b> (${esc(inteiroBr(a.quantidade))}) — ${esc(a.mensagem)}</li>`).join("") +
        avisos.map((a) => `<li><b>${esc(a.codigo)}</b> — ${esc(a.detalhe)}. ${esc(a.acao)}</li>`).join("") +
        extras.join("") +
        `</ul></div>`
      : "";

  const secoes: Record<string, string[]> = { geral: [], midia: [], qual: [], faixa: [], notas: [] };

  // ---- 00 Definições ----
  {
    const imp = mt.imposto;
    const lancs = composicao.length
      ? composicao.map((l) => `${l.posicao}. ${esc(l.nome)}${l.principal ? " <b>(principal — Δ e título)</b>" : ""}`).join(" · ")
      : "nenhum — edição única";
    const defs = [
      ["Ingressos", `Compradores de captação únicos (ingresso OU combo), por <b>e-mail</b> — critério ${esc(mt.criterioDeUnico)}. ${esc(mt.diferencaDeFonte.texto)}.`, ""],
      ["Produto Principal", "Vendas do principal deduplicadas (ID da venda e e-mail + produto), status pago, dentro da janela; vendas antes da abertura do carrinho saem automaticamente (decisão 7).", "b2"],
      ["Order Bump / Combo / Downsell", "Bump e combo = captação (tier superior do ingresso). Downsell = etapa à parte. Avulso = só order bump, fora do comprador de captação.", "b3"],
      ["TMB", `Vendas via TMB são contadas, mas o valor não entra no faturamento ("s/ TMB"). ${esc(mt.tmb.texto ?? "Nenhuma venda via TMB.")}`, ""],
      [
        "Imposto sobre a mídia",
        `${esc(numeroBr(imp.impostoPct * 100, 2))}% — ${esc(ROTULO_ORIGEM_IMPOSTO[imp.impostoOrigem] ?? imp.impostoOrigem)} (procedência: <b>${esc(imp.impostoOrigem)}</b>), aplicado uma vez pelo motor por dia a partir de ${esc(dataBr(imp.corteDeData))}. O documento não reaplica imposto.`,
        "b2",
      ],
      ["Janela do debriefing", `${esc(dataBr(mt.janela.inicio))} a ${esc(dataBr(mt.janela.fim))} — ${esc(mt.janela.regra)}.`, "b3"],
      ["Cliques", "Sempre clique no link (link_click). Sem link_click, CTR/CPC ficam “—”, nunca 0.", ""],
      ["Lançamentos de comparação", lancs, "b2"],
      ["Classificador de origem", `versão ${esc(mt.classificadorVersao)} — canal (aquisição) e fechamento (Closer) são eixos separados, nunca somados.`, "b3"],
    ];
    secoes.geral!.push(
      doc.secao(
        "Definições",
        "Glossário do relatório — os termos valem para todas as seções.",
        `<div class="defbox">${defs.map(([t, d, c]) => `<div class="d${c ? ` ${c}` : ""}"><div class="dt">${esc(t!)}</div><div class="dd">${d}</div></div>`).join("")}</div>`,
      ),
    );
  }

  // ---- 01 Resumo Executivo ----
  {
    const grupos: [Indicador["grupo"], string][] = [
      ["Volume", "Quantitativos"],
      ["Faturamento", "Faturamento (s/ TMB)"],
      ["Mídia", "Métricas de mídia"],
      ["Taxas", "Taxas de conversão"],
    ];
    const corpo = grupos
      .map(
        ([g, rot]) =>
          `<h3 class="gr">${esc(rot)}</h3><div class="kpis">` +
          INDICADORES.filter((i) => i.grupo === g).map((i) => kpi(i, p, A, comp)).join("") +
          `</div>`,
      )
      .join("");
    const corteComp = corteDaComparacao(comp);
    const desc = comp
      ? `Cada card mostra <b>${esc(comp.nome)}</b> (cinza) e <b>${esc(A)}</b> (dourado); Δ% em volume e dinheiro, Δpp em taxa.` +
        (corteComp ? ` <b>Comparação cortada no mesmo D+N:</b> ${esc(comp.nome)} até ${esc(corteComp)}; métrica que só existe de um lado fica com Δ “—”.` : "") +
        (faseDaComparacao(comp) ? ` <span data-fase-da-comparacao>${esc(faseDaComparacao(comp)!)}.</span>` : "")
      : semDelta
        ? `Parcial sem Δ: o lançamento de comparação ${esc(semDelta.nome)} só tem relatório salvo (totais fechados), que não pode ser cortado em D+N — cada card mostra só o valor deste lançamento.`
        : "Edição única: cada card mostra o valor do lançamento, sem comparação (não há lançamento de comparação na config).";
    secoes.geral!.push(doc.secao("Resumo Executivo", desc, corpo));
  }

  // ---- 02 Diferenças de Valores e Taxas ----
  if (comp) {
    const linhas: string[] = [];
    const soDeUmLado: string[] = [];
    for (const g of ["Volume", "Faturamento", "Mídia", "Taxas"] as const) {
      linhas.push(`<tr class="grp"><td colspan="5">${esc(g)}</td></tr>`);
      for (const ind of INDICADORES.filter((i) => i.grupo === g)) {
        const la = lerIndicador(ind, comp.payload);
        const lb = lerIndicador(ind, p);
        const a = la.valor;
        const b = lb.valor;
        if (temCorte(p, comp) && (a === null) !== (b === null)) soDeUmLado.push(`${ind.rotulo} (${(a === null ? la : lb).motivo ?? "sem número"})`);
        let dif = TRACO;
        let var_ = TRACO;
        if (a !== null && b !== null) {
          const { classe } = avaliar(ind, a, b);
          const cor = classe === "up" ? "g" : classe === "down" ? "r" : "y";
          dif = esc(diferencaComSinal(a, b, ind.unidade, ind.casas));
          var_ = `<span class="${cor}">${esc(ehTaxa(ind.unidade) ? pctComSinal(variacaoPct(emPct(a, ind.unidade), emPct(b, ind.unidade))) : pctComSinal(variacaoPct(a, b)))}</span>`;
        }
        linhas.push(tr([esc(ind.rotulo), esc(fmt(a, ind.unidade, ind.casas)), esc(fmt(b, ind.unidade, ind.casas)), dif, var_]));
      }
    }
    secoes.geral!.push(
      doc.secao(
        "Diferenças de Valores e Taxas",
        `Tabela completa ${esc(comp.nome)} → ${esc(A)}: diferença absoluta (Δpp nas taxas) e variação percentual. Verde = melhorou, vermelho = piorou, dourado = sem avaliação (investimento).` +
          (corteDaComparacao(comp) ? ` <b>Comparação cortada no mesmo D+N:</b> ${esc(comp.nome)} até ${esc(corteDaComparacao(comp)!)}.` : "") +
          (faseDaComparacao(comp) ? ` <span data-fase-da-comparacao>${esc(faseDaComparacao(comp)!)}.</span>` : ""),
        tabela(["Métrica", comp.nome, A, "Diferença", "Variação"], linhas) +
          (soDeUmLado.length
            ? `<div class="note" data-delta-lacuna><b>Δ “—”: a métrica existe de um lado e é lacuna do outro</b> — o Δ não é inventado.<ul>${soDeUmLado.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
            : ""),
      ),
    );
  } else if (semDelta) {
    secoes.geral!.push(
      doc.secao(
        "Diferenças de Valores e Taxas",
        "",
        nota(
          `<b>Seção omitida — parcial sem Δ.</b> O lançamento de comparação ${esc(semDelta.nome)} não tem config de debriefing liberada; o único dado dele é o relatório salvo, ` +
            "que tem os totais fechados e não pode ser cortado no mesmo D+N desta parcial (R8-3). Para comparar, configure (e valide) o debriefing dele e gere de novo.",
        ),
      ),
    );
  } else {
    secoes.geral!.push(
      doc.secao(
        "Diferenças de Valores e Taxas",
        "",
        nota(
          "<b>Seção omitida — edição única.</b> A config do debriefing não tem lançamento de comparação (ou o que havia foi removido), então não existe Δ a mostrar. " +
            "A justificativa segue o padrão da skill (§5, adaptação justificada: “Relatório de edição única”). Para comparar, informe um lançamento de comparação no formulário e gere de novo.",
        ),
      ),
    );
  }

  // ---- 03 Evolução Diária ----
  {
    const partes: string[] = [];
    // Investimento diário empilhado por ETAPA (AC6.2) — um gráfico por lançamento.
    const invPorLancamento = (pp: DebriefingPayload, nome: string, id: string) => {
      const dias = [...new Set(pp.dinheiroTempo.midia.midiaDiariaPorEtapa.map((d) => d.dia))].sort();
      if (dias.length === 0) return lacuna(`Investimento diário — ${nome}`, "sem mídia diária no período (nenhuma linha de campanha × dia nas etapas do lançamento)");
      const ini = Math.min(...dias.map((d) => dMais(pp, d)));
      const fim = Math.max(...dias.map((d) => dMais(pp, d)));
      const eixo = Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
      const etapas = [...new Set(pp.dinheiroTempo.midia.midiaDiariaPorEtapa.map((d) => d.stageId))];
      const series = etapas.map((sid, i) => {
        const porDia = new Map(pp.dinheiroTempo.midia.midiaDiariaPorEtapa.filter((d) => d.stageId === sid).map((d) => [dMais(pp, d.dia), d.comImposto]));
        const papel = pp.dinheiroTempo.midia.porEtapa[sid]?.papel;
        return {
          nome: `${etapa(sid)}${papel ? ` (${ROTULO_PAPEL[papel] ?? papel})` : ""}`,
          dados: eixo.map((n) => porDia.get(n) ?? null),
          cor: CORES_DE_SERIE[i % CORES_DE_SERIE.length]!,
        };
      });
      return doc.grafico(
        id,
        {
          tipo: "bar",
          titulo: `Investimento diário por etapa (R$, c/ imposto) — ${nome}`,
          rotulos: eixo.map(rotuloD),
          datas: eixo.map((n) => dataBr(somarDias(d0(pp), n))),
          series,
          formato: "moeda",
          empilhado: true,
          marcos: marcosDoLancamento(pp).map((m) => ({ ...m, indice: m.indice - ini })),
        },
        { alto: true, full: true },
      );
    };
    partes.push(invPorLancamento(p, A, "cInvest"));
    if (comp) partes.push(invPorLancamento(comp.payload, comp.nome, "cInvestComp"));

    // ROAS de captação por dia (barras por lançamento, eixo D)
    const roasDe = (pp: DebriefingPayload) => new Map(pp.dinheiroTempo.roasDiarioCaptacao.map((d) => [d.dMais, d.roas]));
    const eixoRoas = eixoDeDias([p, ...(comp ? [comp.payload] : [])], (pp) => pp.dinheiroTempo.roasDiarioCaptacao.map((d) => d.dMais));
    if (eixoRoas.length === 0) {
      partes.push(lacuna("ROAS de captação por dia", "sem investimento diário de captação no período"));
    } else {
      const series: SerieDoGrafico[] = [];
      if (comp) {
        const m = roasDe(comp.payload);
        series.push({ nome: comp.nome, dados: eixoRoas.map((n) => m.get(n) ?? null), cor: COR.cinza });
      }
      const ma = roasDe(p);
      series.push({ nome: A, dados: eixoRoas.map((n) => ma.get(n) ?? null), cor: COR.gold });
      partes.push(
        doc.grafico(
          "cRoasCap",
          {
            tipo: "bar",
            titulo: "ROAS de Captação por dia (faturamento da captação ÷ investimento de captação)",
            rotulos: eixoRoas.map(rotuloD),
            datas: eixoRoas.map((n) => dataBr(somarDias(d0(p), n))),
            series,
            formato: "roas",
            marcos: marcosDoLancamento(p).map((m) => ({ ...m, indice: m.indice - eixoRoas[0]! })),
          },
          { alto: true, full: true, nota: "Dias sem gasto ficam sem barra (ROAS indefinido, nunca infinito)." },
        ),
      );
    }
    // Picos-artefato (armadilha #10, decisão 6)
    const picos = mt.roasDiarioCaptacao.filter((d) => d.picoArtefato);
    if (picos.length > 0) {
      partes.push(
        `<div class="note">⚠ <b>Picos-artefato (${esc(inteiroBr(picos.length))}):</b> ROAS alto em dia de investimento abaixo do limiar ` +
          `(${esc(fmt(mt.limiarPicoArtefato.limiarPicoArtefato, "moeda"))} = ${esc(numeroBr(mt.limiarPicoArtefato.fracao * 100, 0))}% da média diária da captação). ` +
          `Não indica eficiência — a venda do dia não veio do gasto do dia.<ul>` +
          picos
            .map(
              (d) =>
                `<li>${esc(rotuloD(d.dMais))} (${esc(dataBr(d.dia))}): ROAS ${esc(fmt(d.roas, "roas"))} com investimento ${esc(fmt(d.investimento, "moeda"))} e faturamento ${esc(fmt(d.faturamento, "moeda"))}</li>`,
            )
            .join("") +
          `</ul></div>`,
      );
    }
    partes.push(
      lacuna(
        "Ingressos por dia",
        "o payload não traz a série diária de ingressos (a 49.3 entrega a coorte das vendas do principal por dia do lead, não os ingressos por dia) — o gráfico não é desenhado; o total está no Resumo",
      ),
    );
    // Vendas do principal por dia (coorte de entrada do lead)
    const eixoCoorte = eixoDeDias([p, ...(comp ? [comp.payload] : [])], (pp) => pp.dinheiroTempo.coorte.serie.map((s) => s.dMais));
    if (lacCarrinho) {
      partes.push(lacuna("Vendas do principal por dia (coorte)", lacCarrinho));
    } else if (eixoCoorte.length > 0) {
      const series: SerieDoGrafico[] = [];
      if (comp) {
        const m = new Map(comp.payload.dinheiroTempo.coorte.serie.map((s) => [s.dMais, s.vendas]));
        series.push({ nome: comp.nome, dados: eixoCoorte.map((n) => m.get(n) ?? null), cor: COR.cinza });
      }
      const m = new Map(mt.coorte.serie.map((s) => [s.dMais, s.vendas]));
      series.push({ nome: A, dados: eixoCoorte.map((n) => m.get(n) ?? null), cor: COR.gold });
      partes.push(
        doc.grafico(
          "cCoorte",
          { tipo: "bar", titulo: "Vendas do Produto Principal por dia de entrada do lead (coorte)", rotulos: eixoCoorte.map(rotuloD), series, formato: "inteiro" },
          {
            alto: true,
            full: true,
            nota:
              `Coorte por data do lead (D0 = ${esc(dataBr(mt.coorte.d0))}, até D+${esc(inteiroBr(mt.coorte.maxD))}): ${esc(inteiroBr(mt.coorte.naCoorte))} na coorte, ${esc(inteiroBr(mt.coorte.basePreLancamento))} da base pré-lançamento, ${esc(inteiroBr(mt.coorte.foraDaCoorte.length))} fora da coorte (sem data do lead), ${esc(inteiroBr(mt.coorte.alemDaJanela.length))} além da janela.` +
              // 49.14 (AC3): carrinho em curso — a coorte é incompleta.
              (mt.coorte.incompleta ? ` <b data-coorte-incompleta>${esc(mt.coorte.incompleta.texto)}.</b>` : ""),
          },
        ),
      );
    } else {
      partes.push(lacuna("Vendas do principal por dia (coorte)", "nenhuma venda do principal com data de lead no período"));
    }
    // Apêndice — reabertura (AC6.4)
    const ap = mt.apendiceReabertura;
    const lacReab = lacunaDaReabertura(p);
    const parcialReab = parcialDaFase(p, "reabertura");
    partes.push(
      lacCarrinho
        ? lacuna("Apêndice — Reabertura", lacCarrinho)
        : lacReab
          ? lacuna("Apêndice — Reabertura", lacReab)
        : ap.aplicavel
        ? `<h3 class="gr">Apêndice — Reabertura (fora das taxas headline)</h3>` +
            tabela(
              ["Reabertura", "Vendas", "Faturamento", "Investimento (mídia própria)", "ROAS marginal"],
              [tr(["Etapa extraordinária", esc(inteiroBr(ap.vendas)), esc(fmt(ap.faturamento, "moeda")), esc(fmt(ap.investimento, "moeda")), celulaMetrica(ap.roasMarginal, "roas")])],
            ) +
            nota(
              `A reabertura ${esc(ap.nota)} — por isso as taxas do Resumo não a incluem. Total combinado (só referência): faturamento ${esc(fmt(mt.referenciaCombinada.faturamento, "moeda"))}, investimento ${esc(fmt(mt.referenciaCombinada.investimento, "moeda"))}, ROAS ${celulaMetrica(mt.referenciaCombinada.roas, "roas")}.`,
            ) +
            (parcialReab ? `<p class="tnote" data-parcial-da-fase>${esc(parcialReab)}</p>` : "")
        : nota("<b>Apêndice de reabertura:</b> não houve reabertura neste lançamento (resposta explícita no formulário)."),
    );
    secoes.geral!.push(
      doc.secao(
        "Evolução Diária",
        "Eixo atemporal <b>D, D+1, D+2…</b> (D0 = início da captação); as linhas verticais marcam abertura/fim do carrinho, reabertura e downsell. A data de calendário aparece no tooltip.",
        partes.join(""),
      ),
    );
  }

  // ---- 04 Desempenho por Canal ----
  {
    const linhaA = new Map(mt.tabela1.canais.map((c) => [c.canal, c]));
    const linhaB = comp ? new Map(comp.payload.dinheiroTempo.tabela1.canais.map((c) => [c.canal, c])) : null;
    const canais = CANAIS.filter((c) => linhaA.has(c) || linhaB?.has(c));
    const serie = (m: Map<Canal, { ingressos: number; vendas: number }>, k: "ingressos" | "vendas") => canais.map((c) => m.get(c)?.[k] ?? 0);
    const graf = (id: string, k: "ingressos" | "vendas", titulo: string, cor: string) =>
      doc.grafico(id, {
        tipo: "bar",
        titulo,
        rotulos: canais.map(String),
        series: [
          ...(comp && linhaB ? [{ nome: comp.nome, dados: serie(linhaB, k), cor: COR.cinza }] : []),
          { nome: A, dados: serie(linhaA, k), cor },
        ],
        formato: "inteiro",
      }, { alto: true });
    const cab = comp
      ? ["Canal (aquisição)", `Ingr. ${comp.nome}`, `Ingr. ${A}`, `Vd. ${comp.nome}`, `Vd. ${A}`, `Conv. ${comp.nome}`, `Conv. ${A}`]
      : ["Canal (aquisição)", "Ingressos", "Vendas principal", "Conversão"];
    // 49.12 (AC6): vendas do principal em lacuna escrevem a lacuna, nunca 0.
    const vendasDe = (pp: DebriefingPayload, v: number | undefined) => {
      const lac = lacunaDoCarrinho(pp);
      return lac ? `<span title="${esc(lac)}" data-lacuna="CARRINHO_AINDA_NAO_ABRIU">${TRACO}</span>` : esc(fmt(v, "inteiro"));
    };
    const linhas = canais.map((c) => {
      const a = linhaA.get(c);
      const b = linhaB?.get(c);
      const cls = c === "Sem track real" ? "r" : c === "Aquisição não rastreada (só closer)" ? "y" : "";
      const nome = cls ? `<span class="${cls}">${esc(c)}</span>` : esc(c);
      return comp
        ? tr([nome, esc(fmt(b?.ingressos, "inteiro")), esc(fmt(a?.ingressos, "inteiro")), vendasDe(comp.payload, b?.vendas), vendasDe(p, a?.vendas), celulaMetrica(b?.conversao, "fracao"), celulaMetrica(a?.conversao, "fracao")])
        : tr([nome, esc(fmt(a?.ingressos, "inteiro")), vendasDe(p, a?.vendas), celulaMetrica(a?.conversao, "fracao")]);
    });
    const s = mt.tabela1.somas;
    const total = comp
      ? tr(["TOTAL (Σ canais)", esc(fmt(comp.payload.dinheiroTempo.tabela1.somas.ingressosPorCanal, "inteiro")), esc(fmt(s.ingressosPorCanal, "inteiro")), vendasDe(comp.payload, comp.payload.dinheiroTempo.tabela1.somas.vendasPorCanal), vendasDe(p, s.vendasPorCanal), TRACO, TRACO], "tot")
      : tr(["TOTAL (Σ canais)", esc(fmt(s.ingressosPorCanal, "inteiro")), vendasDe(p, s.vendasPorCanal), TRACO], "tot");
    const fech = (pp: DebriefingPayload) => pp.dinheiroTempo.tabela1.fechamento;
    const linhasFech = (["closer", "semCloser"] as const).map((k) => {
      const rot = k === "closer" ? "Closer (fechamento 1×1)" : "Sem closer";
      const a = fech(p)[k];
      if (!comp) return tr([esc(rot), esc(fmt(a.ingressos, "inteiro")), vendasDe(p, a.vendas), celulaMetrica(a.conversao, "fracao")]);
      const b = fech(comp.payload)[k];
      return tr([esc(rot), vendasDe(comp.payload, b.vendas), vendasDe(p, a.vendas), celulaMetrica(b.conversao, "fracao"), celulaMetrica(a.conversao, "fracao")]);
    });
    const cabFech = comp ? ["Fechamento", `Vd. ${comp.nome}`, `Vd. ${A}`, `Conv. ${comp.nome}`, `Conv. ${A}`] : ["Fechamento", "Ingressos", "Vendas principal", "Conversão"];
    const tab2 = lacunaDe("LISTAS_FRONT_COMUNIDADE");
    const corpo =
      `<div class="warn">⚠ <b>Por que os totais podem diferir do Resumo:</b> ${esc(mt.diferencaDeFonte.texto)}. Referência do Resumo: ingressos ${esc(inteiroBr(s.referencia.ingressosUnicos))}, vendas do principal ${lacCarrinho ? esc(lacCarrinho) : esc(inteiroBr(s.referencia.vendasPrincipal))}.</div>` +
      `<h3 class="gr">Tabela 1 — Canais de aquisição (mutuamente exclusivos · reconciliam com o total)</h3>` +
      `<div class="chart-grid">${graf("cCanalIng", "ingressos", "Ingressos por canal", COR.teal)}${lacCarrinho ? lacuna("Vendas do principal por canal", lacCarrinho) : graf("cCanalVd", "vendas", "Vendas do principal por canal", COR.orange)}</div>` +
      `<div class="chart-grid" style="margin-top:14px"><div>${tabela(cab, linhas, { total })}</div><div>` +
      `<h3 class="cap">Fechamento — Closer (eixo separado, nunca somado aos canais)</h3>${tabela(cabFech, linhasFech)}</div></div>` +
      `<p class="tnote">"Aquisição não rastreada (só closer)" é linha própria, distinta de "Sem track real" (R2-5). Conversão = vendas do principal ÷ ingressos do canal.</p>` +
      `<h3 class="gr" style="margin-top:24px">Tabela 2 — Segmentos sobrepostos (listas Front / Comunidade)</h3>` +
      lacuna("Tabela 2 não construída", tab2 ? `${tab2.motivo}${tab2.detalhe ? ` (${tab2.detalhe})` : ""}` : "as listas-mestre Front/Comunidade não têm fonte no Loyola");
    secoes.geral!.push(
      doc.secao(
        "Desempenho por Canal",
        "Duas classificações <b>diferentes e separadas</b>: canal de <b>aquisição</b> (UTM do lead, com a da venda como fallback) e <b>fechamento</b> (Closer). Uma não soma com a outra.",
        corpo,
      ),
    );
  }

  // ---- 05 ROAS ----
  {
    const cols = comp ? ["Nível de ROAS", comp.nome, A, "O que mede"] : ["Nível de ROAS", A, "O que mede"];
    const nivel = (rot: string, ler: (pp: DebriefingPayload) => Pick<Metrica, "valor" | "motivo">, oque: string, classe = "") => {
      const celula = (pp: DebriefingPayload) => {
        const m = ler(pp);
        if (m.valor === null) return celulaMetrica(m, "roas");
        return `<span class="${m.valor >= 1 ? "g" : "r"}">${esc(fmt(m.valor, "roas"))}</span>`;
      };
      return tr([esc(rot), ...(comp ? [celula(comp.payload)] : []), celula(p), `<span style="color:var(--muted)">${esc(oque)}</span>`], classe);
    };
    const linhas = [
      nivel("Só ingresso ÷ investimento de captação", (pp) => pp.dinheiroTempo.roasSoIngresso, "a captação se paga sem o bump?"),
      nivel("Captação (ingresso + combo + bump) ÷ investimento de captação", (pp) => pp.dinheiroTempo.roasCaptacao, "a captação se paga com o bump?"),
      nivel("Total s/ TMB (captação + principal + downsell) ÷ investimento total", (pp) => pp.dinheiroTempo.roasTotalSemTmb, "visão do funil completo", "tot"),
    ];
    const tese = mt.teseOrderBump;
    const veredito =
      tese.veredito === "confirmada"
        ? { texto: "Tese confirmada", boa: true }
        : tese.veredito === "nao-confirmada"
          ? { texto: "Tese não confirmada", boa: false }
          : { texto: "Indefinida", boa: false };
    const corpoTese =
      tese.roasSoIngresso === null || tese.roasCaptacao === null
        ? "Sem os dois ROAS de captação não há como afirmar o papel do order bump."
        : `Só com o ingresso, o ROAS de captação é <b>${esc(fmt(tese.roasSoIngresso, "roas"))}</b> (${tese.roasSoIngresso >= 1 ? "acima" : "abaixo"} de 1); ` +
          `com combo e order bump, <b>${esc(fmt(tese.roasCaptacao, "roas"))}</b> (${tese.roasCaptacao >= 1 ? "acima" : "abaixo"} de 1). ` +
          `A tese "o bump viabiliza a captação" vale quando o primeiro fica abaixo de 1 e o segundo acima.`;
    const d = mt.roasTotalSemTmb.decomposicao;
    const corpo =
      tabela(cols, linhas) +
      (lacCarrinho
        ? lacuna("ROAS total (captação + principal + downsell)", lacCarrinho)
        : `<p class="tnote">Decomposição do numerador do ROAS total: captação ${esc(fmt(d.captacao, "moeda"))} + principal ${esc(fmt(d.principal, "moeda"))} + ${parcelaDoDownsell(mt.roasTotalSemTmb)} (s/ TMB). ROAS sem o downsell: ${celulaMetrica(mt.roasTotalSemTmb.semDownsell, "roas")}.</p>` +
          // 49.14 (AC3): o ROAS total com o carrinho em curso é parcial.
          (parcialDaFase(p, "carrinho") ? `<p class="tnote" data-parcial-da-fase>ROAS total ${esc(parcialDaFase(p, "carrinho")!)}.</p>` : "")) +
      insight("Tese do order bump", veredito, corpoTese);
    secoes.geral!.push(doc.secao("ROAS", "ROAS = faturamento ÷ investimento de mídia c/ imposto. Três níveis: só ingresso, captação (com o bump) e total.", corpo));
  }

  // ---- 06 Principais Pontos & Recomendações (bloco da IA — reserva determinística) ----
  {
    const leituras: string[] = [];
    if (comp) {
      const chaves = [
        "Ingressos (compradores de captação únicos)",
        "Conversão Ingresso → Principal",
        "ROAS Captação (ingresso + combo + bump)",
        "ROAS Total s/ TMB (fat ÷ invest total)",
        "% A+B (respondentes)",
      ];
      for (const rot of chaves) {
        const ind = INDICADORES.find((i) => i.rotulo === rot)!;
        const a = lerIndicador(ind, comp.payload).valor;
        const b = lerIndicador(ind, p).valor;
        if (a === null || b === null) continue;
        const av = avaliar(ind, a, b);
        const verbo = verboDirecao(a, b);
        leituras.push(
          insight(
            `${ind.rotulo} ${verbo}`,
            av.boa === true ? { texto: "Melhorou", boa: true } : av.boa === false ? { texto: "Piorou", boa: false } : { texto: "Estável", boa: false },
            `De <b>${esc(fmt(a, ind.unidade, ind.casas))}</b> (${esc(comp.nome)}) para <b>${esc(fmt(b, ind.unidade, ind.casas))}</b> (${esc(A)}) — ${esc(textoDoDelta(ind, a, b))}.`,
            true,
          ),
        );
      }
    } else {
      const roasCap = mt.roasCaptacao.valor;
      const roasTot = mt.roasTotalSemTmb.valor;
      if (roasCap !== null) {
        leituras.push(
          insight(
            "ROAS de captação",
            roasCap >= 1 ? { texto: "Captação se paga", boa: true } : { texto: "Captação não se paga", boa: false },
            `ROAS de captação <b>${esc(fmt(roasCap, "roas"))}</b> — ${roasCap >= 1 ? "acima" : "abaixo"} de 1.`,
            true,
          ),
        );
      }
      if (roasTot !== null) {
        leituras.push(
          insight(
            "ROAS total do funil",
            roasTot >= 1 ? { texto: "Funil se paga", boa: true } : { texto: "Funil não se paga", boa: false },
            `ROAS total s/ TMB <b>${esc(fmt(roasTot, "roas"))}</b> — ${roasTot >= 1 ? "acima" : "abaixo"} de 1.`,
            true,
          ),
        );
      }
    }
    const semTrack = mt.tabela1.canais.find((c) => c.canal === "Sem track real");
    if (semTrack && !lacCarrinho) {
      leituras.push(
        insight(
          "Rastreamento das vendas do principal",
          semTrack.vendas > 0 ? { texto: "Conferir", boa: false } : { texto: "Rastreado", boa: true },
          `<b>${esc(inteiroBr(semTrack.vendas))}</b> de ${esc(inteiroBr(mt.vendasPrincipal))} vendas do principal sem rastreio real (nem UTM do lead, nem da venda, nem closer).`,
          true,
        ),
      );
    }
    const recs = mt.pendencias.map((pe) => ({ t: pe.codigo, d: pe.detalhe }));
    // R7-6 (dono, 2026-10-02): produto novo fora do mapa na captação → alerta
    // NÃO bloqueante, com a lista (produto, vendas, faturamento, como foi contado).
    const fora = mt.produtosNaoClassificados;
    const alertaProdutoNovo = fora.length
      ? `<div class="warn" data-alerta="${ALERTA_PRODUTO_FORA_DO_MAPA}"><b>Produto novo fora do mapa na captação (não bloqueia):</b><ul>` +
        fora
          .map(
            (x) =>
              `<li><b>${esc(x.produto)}</b> — ${esc(inteiroBr(x.vendas))} venda(s), ${esc(fmt(x.faturamento, "moeda"))}; contado como ${esc(x.tiposAssumidos.join("/") || TRACO)} pela regra padrão do painel.</li>`,
          )
          .join("") +
        `</ul>Classificar o(s) produto(s) no mapa de produtos da etapa de captação e gerar de novo, se o papel for outro.</div>`
      : "";
    const recsHtml = alertaProdutoNovo + (recs.length
      ? `<div class="recs" style="margin-top:8px">${recs.map((r, i) => `<div class="rec"><div class="n">${i + 1}</div><h4>${esc(r.t)}</h4><p>${esc(r.d)}</p></div>`).join("")}</div>`
      : nota("Nenhuma pendência de classificação no payload (campanha sem fase/público, mídia ou venda de etapa fora da config)."));
    secoes.geral!.push(
      doc.secao(
        "Principais Pontos & Recomendações",
        "Leituras derivadas do dado (verbo e tag saem do sinal; nada de adjetivo fixo) e as pendências que o gerador encontrou.",
        blocoIa("pontos", leituras.join("") + `<h3 class="gr">O que conferir</h3>` + recsHtml),
        true,
      ),
    );
  }

  // ---- 07 Mídia Paga — Visão Geral ----
  {
    const kpisMidia = INDICADORES.filter((i) => i.grupo === "Mídia").slice(0, 8).map((i) => kpi(i, p, A, comp)).join("");
    const linhasEtapa = (pp: DebriefingPayload, nome: string) =>
      Object.entries(pp.dinheiroTempo.midia.porEtapa).map(([sid, m]) =>
        tr([
          `${comp ? `${esc(nome)} · ` : ""}${esc(etapa(sid))} <span style="color:var(--muted);font-size:11px">(${esc(ROTULO_PAPEL[m.papel] ?? m.papel)})</span>`,
          esc(fmt(m.investimentoComImposto, "moeda")),
          esc(fmt(m.impressoes, "inteiro")),
          esc(fmt(m.linkClicks, "inteiro")),
          celulaMetrica(m.ctr, "pct", 2),
          celulaMetrica(m.cpm, "moeda"),
          celulaMetrica(m.cpc, "moeda"),
        ]),
      );
    const linhas = [...(comp ? linhasEtapa(comp.payload, comp.nome) : []), ...linhasEtapa(p, A)];
    const semLink = mt.midia.porGrupo.captacao.linhasSemLinkClick;
    const corpo =
      `<div class="kpis">${kpisMidia}</div>` +
      `<div style="margin-top:16px">${tabela(["Etapa", "Invest. (c/ imposto)", "Impressões", "Link clicks", "CTR", "CPM", "CPC"], linhas)}</div>` +
      `<p class="tnote">Custo c/ imposto (${esc(numeroBr(mt.imposto.impostoPct * 100, 2))}%, procedência ${esc(mt.imposto.impostoOrigem)}) · cliques = link clicks · ${esc(inteiroBr(mt.midia.linhasForaDoPeriodo))} linha(s) de mídia fora da janela não entraram.` +
      (semLink > 0 ? ` ${esc(inteiroBr(semLink))} campanha×dia da captação sem link_click (fora da soma de cliques).` : "") +
      `</p>`;
    secoes.midia!.push(doc.secao("Mídia Paga — Visão Geral", "Mídia por etapa do lançamento: investimento, impressões, cliques no link, CTR, CPM e CPC.", corpo));
  }

  // ---- 08 Quente × Frio ----
  {
    const qf = (pp: DebriefingPayload) => pp.dinheiroTempo.midia.porGrupo.captacao.quenteFrio;
    const lancs = comp ? [{ nome: comp.nome, pp: comp.payload }, { nome: A, pp: p }] : [{ nome: A, pp: p }];
    const g = doc.grafico(
      "cQuenteFrio",
      {
        tipo: "bar",
        titulo: "Investimento de captação Quente × Frio (R$, c/ imposto)",
        rotulos: lancs.map((l) => l.nome),
        series: [
          { nome: "Quente", dados: lancs.map((l) => qf(l.pp).INV_QUENTE), cor: COR.orange },
          { nome: "Frio", dados: lancs.map((l) => qf(l.pp).INV_FRIO), cor: COR.blue },
          { nome: "Indefinido", dados: lancs.map((l) => qf(l.pp).INV_INDEFINIDO), cor: COR.cinza },
        ],
        formato: "moeda",
        horizontal: true,
        empilhado: true,
      },
      { full: true },
    );
    const linhas = lancs.map((l) => {
      const q = qf(l.pp);
      return tr([
        esc(l.nome),
        esc(fmt(q.INV_QUENTE, "moeda")),
        esc(fmt(q.shareQuente, "pct")),
        esc(fmt(q.INV_FRIO, "moeda")),
        esc(fmt(q.shareFrio, "pct")),
        esc(fmt(q.INV_INDEFINIDO, "moeda")),
        esc(fmt(q.shareIndefinido, "pct")),
        esc(fmt(q.INV, "moeda")),
      ]);
    });
    secoes.midia!.push(
      doc.secao(
        "Quente × Frio",
        "Investimento da captação por público, com o share de cada um.",
        g + `<div style="margin-top:14px">${tabela(["Lançamento", "Quente", "Share", "Frio", "Share", "Indefinido", "Share", "Total"], linhas)}</div>`,
      ),
    );
  }

  // ---- 09 Vendas do Principal (+ auditoria) ----
  {
    const partes: string[] = [];
    if (lacCarrinho) {
      // 49.12 (AC6): a seção inteira depende de venda do principal — lacuna escrita.
      // As vendas do principal anteriores à abertura (decisão 7) continuam listadas.
      const exc = mt.vendasExcluidas;
      partes.push(lacuna("Vendas do principal (coorte paga, conversão por público e auditoria)", lacCarrinho));
      if (exc.length) {
        partes.push(
          `<h3 class="gr">Vendas excluídas automaticamente (${esc(inteiroBr(exc.length))})</h3>` +
            `<div class="warn" data-lacuna="VENDAS_EXCLUIDAS_AUTOMATICAMENTE"><b>Fora da conta:</b> vendas do principal anteriores à abertura do carrinho (que ainda não abriu até o corte) — decisão 7 do dono.</div>` +
            tabela(["ID venda", "Produto", "Valor", "Data", "Fonte", "Motivo"], exc.map((v) => tr([esc(v.txId ?? TRACO), esc(v.produto ?? TRACO), esc(fmt(v.valor, "moeda")), esc(v.dataBrt ? dataBr(v.dataBrt) : TRACO), esc(v.fonte), esc(v.motivo)])), { rolagem: exc.length > 12 }),
        );
      }
    } else {
      const eixo = eixoDeDias([p, ...(comp ? [comp.payload] : [])], (pp) => pp.dinheiroTempo.coortePaga.serie.map((s) => s.dMais));
      if (eixo.length > 0) {
        const series: SerieDoGrafico[] = [];
        if (comp) {
          const m = new Map(comp.payload.dinheiroTempo.coortePaga.serie.map((s) => [s.dMais, s.vendas]));
          series.push({ nome: `${comp.nome} (paga)`, dados: eixo.map((n) => m.get(n) ?? null), cor: COR.cinza });
        }
        const m = new Map(mt.coortePaga.serie.map((s) => [s.dMais, s.vendas]));
        series.push({ nome: `${A} (paga)`, dados: eixo.map((n) => m.get(n) ?? null), cor: COR.orange });
        partes.push(doc.grafico("cCoortePaga", { tipo: "bar", titulo: "Vendas do principal com lead pago, por dia de entrada do lead", rotulos: eixo.map(rotuloD), series, formato: "inteiro" }, { alto: true, full: true }));
      } else {
        partes.push(lacuna("Coorte paga", "nenhuma venda do principal com lead pago e data de lead no período"));
      }
      const seg = (pp: DebriefingPayload) => new Map(pp.publico.conversaoPorSegmento.map((s) => [s.segmento, s]));
      const sa = seg(p);
      const sb = comp ? seg(comp.payload) : null;
      const linhasSeg = SEGMENTOS_DE_QUALIFICACAO.map((s) => {
        const a = sa.get(s);
        const b = sb?.get(s);
        return comp
          ? tr([esc(s), esc(fmt(b?.n, "inteiro")), esc(fmt(a?.n, "inteiro")), esc(fmt(b?.comprouPrincipal, "inteiro")), esc(fmt(a?.comprouPrincipal, "inteiro")), celulaMetrica(b?.ingressoPrincipal, "fracao", 2), celulaMetrica(a?.ingressoPrincipal, "fracao", 2)])
          : tr([esc(s), esc(fmt(a?.n, "inteiro")), esc(fmt(a?.comprouPrincipal, "inteiro")), celulaMetrica(a?.ingressoPrincipal, "fracao", 2), a?.amostraBaixa ? "amostra baixa" : ""]);
      });
      partes.push(
        `<h3 class="gr">Conversão ao principal por público (respondentes da pesquisa)</h3>` +
          tabela(
            comp
              ? ["Público", `n ${comp.nome}`, `n ${A}`, `→ Princ. ${comp.nome}`, `→ Princ. ${A}`, `Conv. ${comp.nome}`, `Conv. ${A}`]
              : ["Público", "n", "→ Principal", "Conversão", "Amostra"],
            linhasSeg,
          ),
      );
      // Auditoria — TODAS as vendas do principal, com UTMs (padrão §7)
      const aud = mt.auditoriaDeVendas;
      const linhasAud = aud.map((v) =>
        tr([
          esc(v.dataBrt ? dataBr(v.dataBrt) : TRACO),
          esc(v.txId ?? TRACO),
          esc(v.produto ?? TRACO),
          esc(fmt(v.valor, "moeda")),
          v.tmb ? `<span class="y">TMB — ${esc(fmt(v.valorConsiderado, "moeda"))}</span>` : esc(fmt(v.valorConsiderado, "moeda")),
          esc(v.fonte),
          esc(utmCurta(v.utmVenda)),
          esc(utmCurta(v.utmLead)),
          esc(v.canal),
          esc(v.fechamento === "closer" ? "Closer" : "Sem closer"),
          esc(v.dMais === null ? TRACO : rotuloD(v.dMais)),
        ]),
      );
      partes.push(
        `<h3 class="gr" style="margin-top:24px">Auditoria — todas as vendas do principal, com UTMs (${esc(inteiroBr(aud.length))})</h3>` +
          `<p class="sec-desc">Cada venda do principal que entrou na conta: data, ID da venda, produto, valor bruto, valor considerado (TMB = 0), fonte (planilha ou venda manual), UTM da venda e do lead (source / medium / campaign / term), canal de aquisição, fechamento e D+ do lead. Sem nome, e-mail ou telefone (decisão 11).</p>` +
          (aud.length
            ? tabela(["Data", "ID venda", "Produto", "Valor", "Considerado", "Fonte", "UTM venda", "UTM lead", "Canal", "Fechamento", "D+ lead"], linhasAud, { rolagem: true })
            : lacuna("Auditoria vazia", "nenhuma venda do principal no período")),
      );
      // Vendas excluídas automaticamente (decisão 7)
      const exc = mt.vendasExcluidas;
      partes.push(
        `<h3 class="gr">Vendas excluídas automaticamente (${esc(inteiroBr(exc.length))})</h3>` +
          (exc.length
            ? `<div class="warn" data-lacuna="VENDAS_EXCLUIDAS_AUTOMATICAMENTE"><b>Fora da conta:</b> vendas do principal com data anterior à abertura do carrinho (${esc(dataBr(p.config.datasChave.aberturaCarrinho ?? ""))}) — decisão 7 do dono (R2-4: venda-teste não é excluída).</div>` +
              tabela(["ID venda", "Produto", "Valor", "Data", "Fonte", "Motivo"], exc.map((v) => tr([esc(v.txId ?? TRACO), esc(v.produto ?? TRACO), esc(fmt(v.valor, "moeda")), esc(v.dataBrt ? dataBr(v.dataBrt) : TRACO), esc(v.fonte), esc(v.motivo)])), { rolagem: exc.length > 12 })
            : nota("Nenhuma venda do principal anterior à abertura do carrinho.")),
      );
      if (mt.coorte.foraDaCoorte.length + mt.coorte.alemDaJanela.length > 0) {
        partes.push(
          `<h3 class="gr">Fora da coorte / além da janela</h3>` +
            tabela(
              ["ID venda", "Produto", "Valor", "Data", "Situação"],
              [
                ...mt.coorte.foraDaCoorte.map((v) => tr([esc(v.txId ?? TRACO), esc(v.produto ?? TRACO), esc(fmt(v.valor, "moeda")), esc(v.dataBrt ? dataBr(v.dataBrt) : TRACO), situacaoForaDaCoorte(v.motivo)])),
                ...mt.coorte.alemDaJanela.map((v) => tr([esc(v.txId ?? TRACO), esc(v.produto ?? TRACO), esc(fmt(v.valor, "moeda")), esc(v.dataBrt ? dataBr(v.dataBrt) : TRACO), esc(`além de D+${mt.coorte.maxD} (${rotuloD(v.dMais)})`)])),
              ],
            ),
        );
      }
    }
    secoes.midia!.push(
      doc.secao(
        "Vendas do Principal",
        "Origem real das vendas do principal (UTM do lead, com a da venda como fallback), coorte paga, conversão por público e a auditoria completa para conferência.",
        partes.join(""),
      ),
    );
  }

  // ---- 10 Order Bump (esteira) ----
  {
    const cap = mt.captacao;
    const temEsteira = cap.vendasPorTipo.order_bump + cap.vendasPorTipo.combo > 0;
    const lancs = comp ? [{ nome: comp.nome, pp: comp.payload }, { nome: A, pp: p }] : [{ nome: A, pp: p }];
    let corpo: string;
    if (!cap.aplicavel) {
      corpo = nota(`<b>Esteira não se aplica:</b> ${esc(cap.motivo ?? "captação sem venda")}.`);
    } else if (!temEsteira) {
      corpo = nota("<b>Sem order bump nem combo neste lançamento</b> — a seção de esteira vira nota (padrão da skill, §5). " + (lacCarrinho ? `Downsell: ${esc(lacCarrinho)}.` : lacunaDoDownsell(p) ? `Downsell: ${esc(lacunaDoDownsell(p)!)}.` : mt.downsell.aplicavel ? `Downsell: ${esc(inteiroBr(mt.downsell.vendas))} vendas, ${esc(fmt(mt.downsell.faturamento, "moeda"))}${parcialDaFase(p, "downsell") ? ` (${esc(parcialDaFase(p, "downsell")!)})` : ""}.` : "Sem downsell."));
    } else {
      const g1 = doc.grafico("cBumpFat", {
        tipo: "bar",
        titulo: "Faturamento da captação por tipo (R$, s/ TMB)",
        rotulos: lancs.map((l) => l.nome),
        series: [
          { nome: "Ingresso", dados: lancs.map((l) => l.pp.dinheiroTempo.captacao.faturamentoIngresso.valor), cor: COR.teal },
          { nome: "Combo", dados: lancs.map((l) => l.pp.dinheiroTempo.captacao.faturamentoCombo.valor), cor: COR.purple },
          { nome: "Order bump", dados: lancs.map((l) => l.pp.dinheiroTempo.captacao.faturamentoOrderBump.valor), cor: COR.gold },
        ],
        formato: "moeda",
        empilhado: true,
      });
      const g2 = doc.grafico("cBumpPct", {
        tipo: "bar",
        titulo: "% compradores de captação com combo ou order bump",
        rotulos: lancs.map((l) => l.nome),
        series: [{ nome: "% com tier superior", dados: lancs.map((l) => (l.pp.dinheiroTempo.captacao.comTierSuperior.valor === null ? null : l.pp.dinheiroTempo.captacao.comTierSuperior.valor * 100)), cor: COR.gold }],
        formato: "pct",
      });
      const linhas = lancs.map((l) => {
        const c = l.pp.dinheiroTempo.captacao;
        return tr([
          esc(l.nome),
          esc(fmt(c.vendasPorTipo.ingresso, "inteiro")),
          esc(fmt(c.vendasPorTipo.combo, "inteiro")),
          esc(fmt(c.vendasPorTipo.order_bump, "inteiro")),
          esc(fmt(c.comCombo, "inteiro")),
          esc(fmt(c.comOrderBump, "inteiro")),
          celulaMetrica(c.comTierSuperior, "fracao"),
          `${esc(fmt(c.avulsos.compradores, "inteiro"))} · ${esc(fmt(c.avulsos.faturamento, "moeda"))}`,
        ]);
      });
      corpo =
        `<div class="chart-grid">${g1}${g2}</div><div style="margin-top:14px">` +
        tabela(["Lançamento", "Vendas ingresso", "Vendas combo", "Vendas bump", "Compradores c/ combo", "Compradores c/ bump", "% tier superior", "Avulsos (só bump)"], linhas) +
        `</div><p class="tnote">Avulso = quem comprou só o order bump: entra no faturamento, não no comprador de captação. ${esc(notaTmb(p))}.</p>` +
        (lacCarrinho
          ? lacuna("Downsell (etapa à parte)", lacCarrinho)
          : lacunaDoDownsell(p)
            ? lacuna("Downsell (etapa à parte)", lacunaDoDownsell(p)!)
            : mt.downsell.aplicavel
              ? nota(`<b>Downsell (etapa à parte):</b> ${esc(inteiroBr(mt.downsell.vendas))} vendas, ${esc(fmt(mt.downsell.faturamento, "moeda"))} s/ TMB${parcialDaFase(p, "downsell") ? ` (${esc(parcialDaFase(p, "downsell")!)})` : ""}.`)
              : "");
    }
    secoes.midia!.push(doc.secao("Order Bump", "A esteira da captação: ingresso, combo e order bump — e o downsell, à parte.", corpo));
  }

  // ---- 11 Cross-launch & Listas ----
  {
    const cl = pub.crossLaunch;
    const listas = lacunaDe("LISTAS_FRONT_COMUNIDADE");
    let corpo: string;
    if (!cl.aplicavel) {
      corpo = nota(`<b>Cross-launch não se aplica:</b> ${esc(cl.motivo ?? "sem lançamento de comparação")}.`);
    } else {
      const base = cl.funnelIdAnterior ? (rotulos.funis[cl.funnelIdAnterior] ?? comp?.nome ?? cl.funnelIdAnterior) : TRACO;
      const linhas = [
        tr(["Retorno da base (leads do anterior que compraram a captação agora)", celulaMetrica(cl.retornoDaBase, "pct"), esc(numRazao(cl.retornoDaBase))]),
        tr(["Retorno da base ao principal", celulaMetrica(cl.retornoDaBasePrincipal, "pct"), esc(numRazao(cl.retornoDaBasePrincipal))]),
        tr(["Compradores de captação já na base anterior", celulaMetrica(cl.jaEmBaseAnterior.captacao, "pct"), esc(numRazao(cl.jaEmBaseAnterior.captacao))]),
        tr(["Compradores do principal já na base anterior", celulaMetrica(cl.jaEmBaseAnterior.principal, "pct"), esc(numRazao(cl.jaEmBaseAnterior.principal))]),
      ];
      const valores = [cl.retornoDaBase, cl.retornoDaBasePrincipal, cl.jaEmBaseAnterior.captacao, cl.jaEmBaseAnterior.principal].map((m) => m.valor);
      corpo =
        doc.grafico("cCross", {
          tipo: "bar",
          titulo: `${base} → ${A}: reaproveitamento da base (%)`,
          rotulos: ["Retorno à captação", "Retorno ao principal", "Captação já na base", "Principal já na base"],
          series: [{ nome: "%", dados: valores, cor: COR.teal }],
          formato: "pct",
        }) +
        `<div style="margin-top:14px">${tabela(["Medida", "%", "Base"], linhas)}</div>` +
        `<p class="tnote">Base anterior = ${esc(base)} (${esc(cl.tipoDaBase ?? TRACO)}), casamento por e-mail ou telefone. Leads anteriores: ${esc(fmt(cl.leadsAnteriores, "inteiro"))}; compradores anteriores: ${esc(fmt(cl.compradoresAnteriores, "inteiro"))}. Só a comparação principal (49.11 AC8 e).</p>`;
    }
    if (lacCarrinho && cl.aplicavel) corpo += lacuna("Retorno e presença na base — principal", lacCarrinho);
    corpo += lacuna("Listas-mestre Front / Comunidade", listas ? `${listas.motivo}${listas.detalhe ? ` (${listas.detalhe})` : ""}` : "sem fonte no Loyola");
    secoes.midia!.push(doc.secao("Cross-launch & Listas", "Reaproveitamento da base entre lançamentos e presença nas listas-mestre.", corpo, true));
  }

  // ---- 12 Qualificação ----
  {
    const n = composicao.length;
    const nomesSerie = composicao.map((l) => l.nome);
    const nomeDe = (id: string) => composicao.find((l) => l.funnelId === id)?.nome ?? rotulos.funis[id] ?? id;
    const blocos = pub.dimensoes.map((d, i) => {
      const id = `cDim${i}`;
      // Ordem de leitura (apresentação, nenhum número novo): faixa A→D; as demais
      // por frequência, com no máximo MAX_VALORES_NO_GRAFICO barras — resposta
      // livre (profissão) tem centenas de valores e viraria um borrão.
      const valores =
        d.campo === "faixa"
          ? [...d.total.valores].sort((x, y) => x.rotulo.localeCompare(y.rotulo))
          : [...d.total.valores].sort((x, y) => y.n - x.n).slice(0, MAX_VALORES_NO_GRAFICO);
      const cortados = d.total.valores.length - valores.length;
      const g = doc.grafico(id, {
        tipo: "bar",
        titulo: ROTULO_DIMENSAO[d.campo] ?? d.campo,
        rotulos: [...valores.map((v) => v.rotulo), "Sem resposta"],
        series: [{ nome: "% dos respondentes", dados: [...valores.map((v) => v.pct.valor), d.total.semResposta.pct.valor], cor: CORES_DE_SERIE[i % CORES_DE_SERIE.length]! }],
        formato: "pct",
        horizontal: true,
      }, {
        nota: `n = ${esc(inteiroBr(d.total.n))} · ` +
          (cortados > 0 ? `mostrando os ${MAX_VALORES_NO_GRAFICO} valores mais frequentes de ${esc(inteiroBr(d.total.valores.length))} (os outros ${esc(inteiroBr(cortados))} ficam fora do gráfico) · ` : "") +
          textoDaSerie(d.serieHistorica, d.serieHistoricaMotivo, n, nomesSerie, (d.lancamentosAusentes ?? []).map(nomeDe), (d.lancamentosSemPesquisa ?? []).map(nomeDe)),
      });
      return g;
    });
    const faixa = pub.dimensoes.find((d) => d.campo === "faixa");
    const conv = new Map(pub.conversaoPorSegmento.map((s) => [s.segmento, s]));
    const rotFaixa = ["A", "B", "C", "D"];
    const pctDoValor = (t: { valores: { rotulo: string; pct: Pick<Metrica, "valor" | "motivo"> }[] } | undefined, r: string) =>
      celulaMetrica(t?.valores.find((v) => v.rotulo === r)?.pct ?? { valor: 0 }, "pct");
    const linhasSeg = SEGMENTOS_DE_QUALIFICACAO.map((s: SegmentoDeQualificacao) => {
      const t = faixa?.porSegmento[s];
      const c = conv.get(s);
      return tr([
        esc(s),
        esc(fmt(t?.n ?? pub.segmentos.find((x) => x.segmento === s)?.n, "inteiro")),
        ...rotFaixa.map((r) => (faixa ? pctDoValor(t, r) : TRACO)),
        celulaMetrica(c?.ingressoPrincipal, "fracao", 2),
      ]);
    });
    const linhasFech = (["closer", "sem-closer"] as Fechamento[]).map((f) => {
      const t = faixa?.porFechamento[f];
      return tr([esc(f === "closer" ? "Closer" : "Sem closer"), esc(fmt(t?.n ?? (f === "closer" ? pub.fechamento.closer.n : pub.fechamento.semCloser.n), "inteiro")), ...rotFaixa.map((r) => (faixa ? pctDoValor(t, r) : TRACO))]);
    });
    const naoConf = pub.dimensoesNaoConfirmadas;
    const corpo =
      `<div class="chart-grid">${blocos.join("")}</div>` +
      (blocos.length === 0 ? lacuna("Sem dimensão confirmada", "nenhuma pergunta da pesquisa foi confirmada na config — a qualificação não é inferida") : "") +
      `<h3 class="gr" style="margin-top:22px">Por origem do lead (segmentos mutuamente exclusivos) × Fechamento (à parte)</h3>` +
      `<div class="chart-grid"><div>${tabela(["Segmento (aquisição)", "n", "% A", "% B", "% C", "% D", "Conv. → Principal"], linhasSeg)}</div>` +
      `<div><h3 class="cap">Fechamento — Closer (nunca somado aos segmentos)</h3>${tabela(["Fechamento", "n", "% A", "% B", "% C", "% D"], linhasFech)}</div></div>` +
      `<p class="tnote">"Aquisição não rastreada (só closer)" é segmento próprio, distinto de "Sem track" (R2-5). %A+B por segmento: o payload não traz o agregado, e o documento não o calcula — some as colunas A e B. Respondentes: ${esc(inteiroBr(pub.pesquisa.respondentes))} (${esc(pub.pesquisa.memoria)}).</p>` +
      lacuna("Front (lista)", "Front não é segmento neste produto — é lista sem fonte no Loyola (LISTAS_FRONT_COMUNIDADE); nenhuma linha zerada no lugar") +
      (lacCarrinho ? lacuna("Conversão → Principal por segmento", lacCarrinho) : "") +
      (naoConf.length
        ? lacuna("Dimensões não confirmadas", naoConf.map((d) => `${ROTULO_DIMENSAO[d.campo] ?? d.campo} (${d.motivo})`).join("; ") + " — não aparecem e não são inferidas")
        : "");
    secoes.qual!.push(
      doc.secao(
        "Qualificação",
        "Barras horizontais por dimensão confirmada da pesquisa; abaixo, a faixa por origem do lead e por fechamento. Cada dimensão diz se é série histórica e em quais lançamentos (só a qualificação — sem % por lançamento, decisão R6-6).",
        corpo,
        true,
      ),
    );
  }

  // ---- 13 Captação por Faixa ----
  {
    const fx = pub.faixa;
    let corpo: string;
    if (!fx.aplicavel) {
      corpo = lacuna("Faixa não se aplica", fx.motivo ?? "sem pergunta de faixa confirmada");
    } else {
      const lancs = comp ? [{ nome: comp.nome, pp: comp.payload, cor: COR.cinza }, { nome: A, pp: p, cor: COR.gold }] : [{ nome: A, pp: p, cor: COR.gold }];
      const rot = ["A", "B", "C", "D"] as const;
      const pctFaixa = (pp: DebriefingPayload, r: string) => pp.publico.dimensoes.find((d) => d.campo === "faixa")?.total.valores.find((v) => v.rotulo === r)?.pct.valor ?? null;
      corpo =
        `<div class="chart-grid">` +
        doc.grafico("cFaixaPct", { tipo: "bar", titulo: "Distribuição dos respondentes por faixa (%)", rotulos: [...rot], series: lancs.map((l) => ({ nome: l.nome, dados: rot.map((r) => pctFaixa(l.pp, r)), cor: l.cor })), formato: "pct" }) +
        doc.grafico("cFaixaN", { tipo: "bar", titulo: "Volume de respondentes por faixa (nº)", rotulos: [...rot, "sem faixa", "fora do padrão"], series: lancs.map((l) => ({ nome: l.nome, dados: [...rot.map((r) => l.pp.publico.faixa.distribuicao[r]), l.pp.publico.faixa.distribuicao.semFaixa, l.pp.publico.faixa.distribuicao.foraDoPadrao], cor: l.cor })), formato: "inteiro" }) +
        `</div><div class="kpis" style="margin-top:14px">` +
        INDICADORES.filter((i) => i.rotulo === "% A+B (respondentes)").map((i) => kpi(i, p, A, comp)).join("") +
        `<div class="kpi"><div class="lbl">Volume A+B</div><div class="single"><b>${esc(inteiroBr(fx.volumeAB))}</b></div></div>` +
        `<div class="kpi"><div class="lbl">Volume D</div><div class="single"><b>${esc(inteiroBr(fx.volumeD))}</b></div></div>` +
        `<div class="kpi"><div class="lbl">Cobertura de faixa (compradores)</div><div class="single"><b>${celulaMetrica(fx.coberturaDeFaixa, "pct")}</b></div><div class="tnote">${esc(fx.coberturaDeFaixa.memoria)}</div></div>` +
        `</div>`;
    }
    secoes.faixa!.push(doc.secao("Captação por Faixa", "Distribuição dos respondentes por faixa de lead score (A = melhor → D = pior).", corpo));
  }

  // ---- 14 Conversão por Faixa ----
  {
    const fx = pub.faixa;
    let corpo: string;
    if (!fx.aplicavel) {
      corpo = lacuna("Conversão por faixa não se aplica", fx.motivo ?? "sem pergunta de faixa confirmada");
    } else {
      const lancs = comp ? [{ nome: comp.nome, pp: comp.payload, cor: COR.cinza }, { nome: A, pp: p, cor: COR.gold }] : [{ nome: A, pp: p, cor: COR.gold }];
      const rot = fx.conversaoPorFaixa.map((l) => l.faixa);
      const serie = (pp: DebriefingPayload, k: "ingressoPrincipal" | "ingressoBump") =>
        rot.map((r) => {
          const v = pp.publico.faixa.conversaoPorFaixa.find((l) => l.faixa === r)?.[k].valor;
          return v === null || v === undefined ? null : v * 100;
        });
      // 49.12 (AC6): "→ Principal" em lacuna escreve a lacuna, nunca 0.
      const comprou = (n: number) => (lacCarrinho ? `<span title="${esc(lacCarrinho)}" data-lacuna="CARRINHO_AINDA_NAO_ABRIU">${TRACO}</span>` : esc(inteiroBr(n)));
      const linhas = fx.conversaoPorFaixa.map((l) =>
        tr([esc(l.faixa), esc(inteiroBr(l.n)), comprou(l.comprouPrincipal), celulaMetrica(l.ingressoPrincipal, "fracao", 2), esc(inteiroBr(l.comTierSuperior)), celulaMetrica(l.ingressoBump, "fracao", 2), l.amostraBaixa ? "amostra baixa" : ""]),
      );
      const linhasSeg = pub.conversaoPorSegmento.map((l) =>
        tr([esc(l.segmento), esc(inteiroBr(l.n)), comprou(l.comprouPrincipal), celulaMetrica(l.ingressoPrincipal, "fracao", 2), celulaMetrica(l.ingressoBump, "fracao", 2), l.amostraBaixa ? "amostra baixa" : ""]),
      );
      corpo =
        `<div class="chart-grid">` +
        (lacCarrinho
          ? lacuna("Ingresso → Principal por faixa", lacCarrinho)
          : doc.grafico("cFaixaPrinc", { tipo: "bar", titulo: "Ingresso → Principal por faixa (%)", rotulos: rot, series: lancs.map((l) => ({ nome: l.nome, dados: serie(l.pp, "ingressoPrincipal"), cor: l.cor })), formato: "pct" })) +
        doc.grafico("cFaixaBump", { tipo: "bar", titulo: "Ingresso → Combo/Order Bump por faixa (%)", rotulos: rot, series: lancs.map((l) => ({ nome: l.nome, dados: serie(l.pp, "ingressoBump"), cor: l.cor })), formato: "pct" }) +
        `</div><h3 class="gr">${esc(A)} — detalhe por faixa</h3>` +
        tabela(["Faixa", "Compradores de captação", "→ Principal", "Conv. → Principal", "→ Combo/Bump", "Conv. → Combo/Bump", "Amostra"], linhas) +
        `<h3 class="gr">Isolando o público — conversão por origem do lead</h3>` +
        tabela(["Público", "n", "→ Principal", "Conv. → Principal", "Conv. → Combo/Bump", "Amostra"], linhasSeg) +
        `<p class="tnote">Bases pequenas são marcadas “amostra baixa” — ler como tendência.</p>`;
    }
    secoes.faixa!.push(doc.secao("Conversão por Faixa", "Faixa cruzada com Ingresso → Principal e Ingresso → Combo/Order Bump; abaixo, por público.", corpo));
  }

  // ---- 15 Criativo × Faixa ----
  {
    const cx = pub.criativoXFaixa;
    const tc = pub.tipoDeCriativo;
    let corpo = "";
    if (!cx.aplicavel) {
      corpo += lacuna("Criativo × Faixa não se aplica", cx.motivo ?? "sem faixa ou sem utm_content");
    } else {
      const linhas = cx.criativos.map((c) => {
        // R7-9: o post publicado (IG → FB, cascata da 18.88); sem post, o Ads Manager de antes.
        const href = c.linkDoPost ?? c.linkAdsManager;
        const nome = href
          ? `<a href="${esc(href)}" data-link="${redeDoLinkDoCriativo(c)}" target="_blank" rel="noopener noreferrer">${esc(c.nome)}</a>`
          : esc(c.nome);
        return tr([
          nome,
          esc(inteiroBr(c.n)),
          esc(inteiroBr(c.porFaixa.A)),
          esc(inteiroBr(c.porFaixa.B)),
          esc(inteiroBr(c.porFaixa.C)),
          esc(inteiroBr(c.porFaixa.D)),
          celulaMetrica(c.pctAB, "pct"),
          celulaMetrica(c.pctCD, "pct"),
          esc(c.tipo ?? TRACO),
          c.amostraBaixa ? "amostra baixa" : "",
        ]);
      });
      const semCriativo =
        `${esc(inteiroBr(cx.semCriativo.n))} respondentes (${esc(inteiroBr(cx.semCriativo.vazio))} sem utm_content, ${esc(inteiroBr(cx.semCriativo.naoEhAdId))} com utm_content que não é ID de anúncio)`;
      if (cx.criativos.length === 0) {
        // Tabela sem linha não explica nada: a lacuna diz por que não há criativo.
        corpo += `<div class="warn" data-lacuna="SEM_CRIATIVO_NA_PESQUISA"><b>Nenhum criativo identificado nas respostas</b> — nenhum respondente da pesquisa trouxe um utm_content que seja ID de anúncio. Sem criativo: ${semCriativo}. Para medir, as UTMs dos anúncios precisam levar o Ad ID no utm_content.</div>`;
      } else {
        corpo +=
          tabela(["Criativo (Ad)", "n", "A", "B", "C", "D", "% A+B", "% C+D", "Tipo", "Amostra"], linhas, { rolagem: true }) +
          `<p class="tnote">Ordem do payload (por volume). Sem criativo: ${semCriativo}. O nome abre o post publicado (Instagram; sem ele, Facebook) do anúncio de maior investimento do Ad Name; sem post público, o Ads Manager. Abre em nova aba (depende do viewer da 49.8).</p>`;
      }
    }
    if (!tc.aplicavel) {
      corpo += lacuna(`Dimensão de criativo (${tc.dimensao})`, `não exibida — ${tc.motivo ?? "sem nomenclatura do expert para separar os tipos"}`);
    } else {
      const linhas = tc.tipos.map((t) =>
        tr([esc(t.tipo), esc(inteiroBr(t.criativos)), esc(inteiroBr(t.respondentes)), celulaMetrica(t.pctAB, "pct"), celulaMetrica(t.pctCD, "pct"), celulaMetrica(t.investimentoComImposto, "moeda"), celulaMetrica(t.ctr, "pct", 2), celulaMetrica(t.cpc, "moeda"), celulaMetrica(t.custoPorIngresso, "moeda"), t.amostraBaixa ? "amostra baixa" : ""]),
      );
      corpo +=
        `<h3 class="gr" style="margin-top:22px">Criativo por tipo — ${esc(tc.dimensao)}</h3>` +
        tabela(["Tipo", "Criativos", "Respondentes", "% A+B", "% C+D", "Invest. (c/ imposto)", "CTR", "CPC", "Custo por ingresso", "Amostra"], linhas) +
        (tc.ressalvas.includes("COPY_NAO_PAREADA") ? `<div class="warn"><b>COPY_NAO_PAREADA:</b> os tipos não usaram a mesma copy — a diferença mistura tipo de criativo e mensagem.</div>` : "") +
        (tc.conflitosDeTipo.length ? `<div class="warn"><b>Conflitos de tipo (${esc(inteiroBr(tc.conflitosDeTipo.length))}):</b> ${tc.conflitosDeTipo.map((c) => `${esc(c.adName)} (${esc(c.motivo)})`).join("; ")}</div>` : "");
      if (!tc.adLevel.aplicavel) {
        const l = lacunaDe("SEM_AD_LEVEL");
        corpo += lacuna("Mídia por criativo indisponível", l ? `${l.motivo}${l.detalhe ? ` (${l.detalhe})` : ""}` : "sem ad-level no período — CTR, CPC e custo por tipo não medidos");
      }
    }
    secoes.faixa!.push(doc.secao("Criativo × Faixa", "Qualidade do lead por criativo (utm_content → anúncio): composição de faixa, %A+B e %C+D; e a dimensão de criativo do expert.", corpo, true));
  }

  // ---- 16 Respostas & Padrões + Anotações ----
  {
    const fx = pub.faixa;
    const leituras: string[] = [];
    if (fx.aplicavel) {
      const comValor = fx.conversaoPorFaixa.filter((l) => ["A", "B", "C", "D"].includes(l.faixa) && l.ingressoPrincipal.valor !== null);
      if (comValor.length >= 2) {
        const primeira = comValor[0]!;
        const ultima = comValor[comValor.length - 1]!;
        const v1 = primeira.ingressoPrincipal.valor!;
        const v2 = ultima.ingressoPrincipal.valor!;
        leituras.push(
          insight(
            "Faixa → Ingresso → Principal",
            v1 > v2 ? { texto: "Faixa melhor converte mais", boa: true } : { texto: "Sem gradiente a favor da faixa", boa: false },
            `Conversão ao principal: faixa ${esc(primeira.faixa)} <b>${esc(fmt(v1, "fracao", 2))}</b> × faixa ${esc(ultima.faixa)} <b>${esc(fmt(v2, "fracao", 2))}</b>. ` +
              comValor.map((l) => `${esc(l.faixa)} ${esc(fmt(l.ingressoPrincipal.valor, "fracao", 2))} (n ${esc(inteiroBr(l.n))})`).join(" · "),
            true,
          ),
        );
      }
    }
    const corpo =
      blocoIa("respostas", leituras.join("") || nota("Sem leitura determinística disponível (faixa sem conversão em duas ou mais faixas).")) +
      `<h3 class="gr">Anotações da Campanha</h3>` +
      blocoIa("anotacoes", lacuna("Anotações da campanha", "o payload não traz anotações do time; este espaço é preenchido pela IA (49.7) a partir do payload e editável no viewer"));
    secoes.notas!.push(doc.secao("Respostas & Padrões", "Leitura qualitativa — padrões entre faixa, público e conversão — e as anotações da campanha.", corpo));
  }

  // ---- 17 Base de Conhecimento ----
  {
    const fx = pub.faixa;
    const blocos = [
      lacCarrinho && parcial
        ? [
            // 49.12: a parcial não tem números fechados — os do carrinho são lacuna escrita.
            `Números até o corte (${dataBr(parcial.corte)} · D+${parcial.dMaisN}) — parcial`,
            `Ingressos ${esc(inteiroBr(mt.ingressosUnicos))} · investimento total c/ imposto ${celulaMetrica(mt.midia.investimentoTotal, "moeda")} · ROAS captação ${celulaMetrica(mt.roasCaptacao, "roas")} · %A+B ${celulaMetrica(fx.pctAB, "pct")} · ` +
              `vendas do principal, faturamento total e ROAS total: ${esc(lacCarrinho)}.`,
          ]
        : [
            // 49.14: parcial com o carrinho aberto — números até o corte; todas as fases concluídas — os do final (AC6).
            parcial
              ? parcial.todasAsFasesConcluidas
                ? `Números do relatório final (janela até ${dataBr(parcial.janela.fim)}; corte ${dataBr(parcial.corte)} · D+${parcial.dMaisN}) — parcial`
                : `Números até o corte (${dataBr(parcial.corte)} · D+${parcial.dMaisN}) — parcial${mt.janela.corte?.fases ? `, ${textoDaFaseNoCorte(mt.janela.corte.fases, parcial.corte)}` : ""}`
              : "Números fechados",
            `Ingressos ${esc(inteiroBr(mt.ingressosUnicos))} · vendas do principal ${esc(inteiroBr(mt.vendasPrincipal))} · faturamento total s/ TMB ${esc(fmt(mt.faturamentoTotal, "moeda"))} · investimento total c/ imposto ${celulaMetrica(mt.midia.investimentoTotal, "moeda")} · ROAS total ${celulaMetrica(mt.roasTotalSemTmb, "roas")} · ROAS captação ${celulaMetrica(mt.roasCaptacao, "roas")} · %A+B ${celulaMetrica(fx.pctAB, "pct")}.`,
          ],
      [
        "Definições",
        `Comprador único = <code>${esc(mt.criterioDeUnico)}</code> · imposto ${esc(numeroBr(mt.imposto.impostoPct * 100, 2))}% (<code>${esc(mt.imposto.impostoOrigem)}</code>) aplicado pelo motor · janela ${esc(dataBr(mt.janela.inicio))}–${esc(dataBr(mt.janela.fim))} · classificador <code>${esc(mt.classificadorVersao)}</code> · payload v${esc(String(p.versao))} (${esc(p.tipo)}).`,
      ],
      [
        "Padrões",
        "Cliques = link clicks · custo Meta c/ imposto do Loyola · coorte por data de entrada do lead (D+x) · conversão só Ingresso → Principal · canal (aquisição) e Closer (fechamento) nunca somados · reabertura fora das taxas headline.",
      ],
      [
        "Higiene",
        `Linhas lidas ${esc(inteiroBr(mt.higiene.linhasLidas))} · dedup camada 1 (ID da venda): ${esc(inteiroBr(mt.dedup.camada1.removidas))} removidas · camada 2 (e-mail + produto): ${esc(inteiroBr(mt.dedup.camada2.removidas))} removidas · vendas excluídas automaticamente ${esc(inteiroBr(mt.vendasExcluidas.length))} · vendas manuais ${esc(inteiroBr(mt.vendasManuais.linhasLidas))}.`,
      ],
      [
        "Lacunas declaradas",
        p.lacunas.length
          ? p.lacunas.map((l) => `<code>${esc(l.codigo)}</code> ${esc(l.motivo)}${l.detalhe ? ` (${esc(l.detalhe)})` : ""}`).join("<br>")
          : "nenhuma",
      ],
    ];
    secoes.notas!.push(
      doc.secao(
        "Base de Conhecimento",
        "Fatos e números fechados que alimentam o próximo debriefing (e a mente “Debriefing”, 49.9 — que lê o payload, não este HTML).",
        blocos.map(([t, c]) => `<div class="k-block"><h4>${esc(t!)}</h4>${c}</div>`).join(""),
        true,
      ),
    );
  }

  const abas: [string, string][] = [
    ["geral", "Visão Geral"],
    ["midia", "Mídia Paga · Vendas"],
    ["qual", "Qualificação"],
    ["faixa", "Faixa · Criativos"],
    ["notas", "Aprendizados"],
  ];
  const nav = `<div class="nav">${abas.map(([k, r], i) => `<button${i === 0 ? ' class="on"' : ""} data-tab="${k}">${esc(r)}</button>`).join("")}</div>`;
  const corpo = abas.map(([k], i) => `<div class="tab${i === 0 ? " on" : ""}" id="tab-${k}">${secoes[k]!.join("")}</div>`).join("");

  const D = {
    versao: p.versao,
    tipo: p.tipo,
    lancamento: A,
    comparacao: comp?.nome ?? null,
    geradoEm: p.geradoEm,
    graficos: doc.graficos,
  };
  const tituloPagina = parcial
    ? comp
      ? `Debriefing Comparativo PARCIAL ${A} × ${comp.nome} · ${rotuloParcial}`
      : `Debriefing PARCIAL — ${A} (${rotulos.projeto}) · ${rotuloParcial}`
    : comp
      ? `Debriefing Comparativo ${A} × ${comp.nome}`
      : `Debriefing — ${A} (${rotulos.projeto}) · edição única`;

  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(tituloPagina)}</title>` +
    `<script src="${CHART_JS_URL}"></script><script src="${DATALABELS_URL}"></script>` +
    `<style>${CSS_DO_DEBRIEFING}</style></head><body><div class="wrap">` +
    header +
    avisoParcial +
    banner +
    nav +
    corpo +
    `<footer>Loyola X — ${esc(tituloPagina)} · custo c/ imposto (${esc(mt.imposto.impostoOrigem)}) · cliques = link clicks · gerado em ${esc(dataBr(p.geradoEm.slice(0, 10)))}</footer>` +
    `</div><script>${SCRIPT_DAS_ABAS}</script><script>const D=${escaparJson(D)};\n${SCRIPT_DOS_GRAFICOS}</script></body></html>`
  );
}

// ---------------------------------------------------------------------------
// Auxiliares puros
// ---------------------------------------------------------------------------

/** Eixo contínuo de D+n cobrindo os dias dados pelos lançamentos. */
function eixoDeDias(lancs: DebriefingPayload[], dias: (p: DebriefingPayload) => number[]): number[] {
  const todos = lancs.flatMap(dias);
  if (todos.length === 0) return [];
  const ini = Math.min(...todos);
  const fim = Math.max(...todos);
  return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
}

function numRazao(m: { valor: number | null; numerador?: number | null; denominador?: number | null }): string {
  const r = m as { numerador?: number | null; denominador?: number | null };
  return r.numerador != null && r.denominador != null ? `${inteiroBr(r.numerador)} de ${inteiroBr(r.denominador)}` : TRACO;
}

/** Texto da série histórica de uma dimensão (49.11 AC9 b) — composição pelos nomes. */
function textoDaSerie(
  serie: boolean,
  motivo: string,
  n: number,
  nomes: string[],
  ausentes: string[],
  semPesquisa: string[],
): string {
  if (serie) {
    return `<b>série histórica</b> em ${n + 1} lançamentos (este + ${n}: ${nomes.map(esc).join(", ")})`;
  }
  switch (motivo) {
    case "SEM_LANCAMENTO_DE_COMPARACAO":
      return "não é série (sem lançamento de comparação)";
    case "AUSENTE_EM_LANCAMENTO_DA_LISTA":
    case "AUSENTE_NO_LANCAMENTO_DE_COMPARACAO":
      return `não é série — a pergunta falta em: ${(ausentes.length ? ausentes : nomes).map(esc).join(", ")}`;
    case "COMPARACAO_SEM_PESQUISA":
      return `não é série — sem pesquisa conectada em: ${(semPesquisa.length ? semPesquisa : nomes).map(esc).join(", ")}${ausentes.length ? `; pergunta ausente em: ${ausentes.map(esc).join(", ")}` : ""}`;
    default:
      return `não é série (${esc(motivo)})`;
  }
}
