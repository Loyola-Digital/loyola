/**
 * Story 49.6 — render do Debriefing (puro, sem banco). Payload REAL dos motores
 * (49.3/49.4) sobre a entrada sintética da 49.5 (`payloadSintetico`).
 *
 * Cobre: ordem canônica pelos `sec-num` (AC3), edição única (AC3), paleta e
 * classes (AC4), versões fixas e `const D` único (AC5), D+n (AC6.1), empilhado
 * por etapa (AC6.2), literal narrativo com dois payloads opostos (AC7),
 * lacunas escritas (AC8), proibidos/escape/rel (AC9), pureza e `null → —`
 * (AC10), tabelas estáticas (REL-002) e a composição da série (49.11 AC9).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHART_JS_URL,
  DATALABELS_URL,
  SECOES_DO_DEBRIEFING,
  renderDebriefing,
  type DebriefingRenderInput,
} from "../services/debriefing-render.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { moedaBr } from "../services/launch-report-narrative.js";
import { payloadSintetico } from "./fixtures/debriefing-payload-sintetico.js";

const ROT = {
  projeto: "Expert Teste",
  lancamento: "PG02",
  etapas: { "stage-cap": "Captação Paga", "stage-prin": "Vendas" },
  funis: { "f-b": "PG01", "f-c": "PG00" },
};

function clone(p: DebriefingPayload): DebriefingPayload {
  return JSON.parse(JSON.stringify(p)) as DebriefingPayload;
}

function entrada(over: Partial<DebriefingRenderInput> = {}): DebriefingRenderInput {
  const p = payloadSintetico();
  return { payload: p, comparacao: null, rotulos: ROT, alertas: validateDebriefing(p).alertas, ...over };
}

function comComparacao(atual = payloadSintetico(), anterior = payloadSintetico()): DebriefingRenderInput {
  return { payload: atual, comparacao: { funnelId: "f-b", nome: "PG01", payload: anterior }, rotulos: ROT, alertas: [] };
}

/** `[sec-num, título]` na ordem em que aparecem no documento. */
function secoes(html: string): [string, string][] {
  return [...html.matchAll(/<span class="sec-num">(\d{2})<\/span><h2>([^<]+)<\/h2>/g)].map((m) => [m[1]!, m[2]!.replace(/&amp;/g, "&")]);
}

/** O objeto `D` do script, parseado (AC5: legível e auditável). */
function dadosD(html: string): { graficos: Record<string, { rotulos: string[]; series: { dados: (number | null)[] }[]; empilhado?: boolean; datas?: string[] }> } {
  const m = /const D=(\{.*?\});\n/s.exec(html);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]!);
}

/** Texto visível (sem `<script>`, `<style>` e tags). */
function textoVisivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

describe("AC3 — estrutura e ordem canônica", () => {
  it("com comparação: as 18 seções numeradas 00→17 na ordem do §4, Definições primeiro e Base de Conhecimento por último", () => {
    const html = renderDebriefing(comComparacao());
    const s = secoes(html);
    expect(s.map(([, t]) => t)).toEqual([...SECOES_DO_DEBRIEFING]);
    expect(s.map(([n]) => n)).toEqual(SECOES_DO_DEBRIEFING.map((_, i) => String(i).padStart(2, "0")));
    expect(html).toContain("Debriefing Comparativo <b>PG02</b> × <b>PG01</b>");
    expect(html).toContain('class="twin"');
    expect(html).toContain('class="tg pg2"');
  });

  it("edição única: mesma ordem, KPI de valor único (sem twin/Δ) e Diferenças omitida COM a justificativa escrita", () => {
    const html = renderDebriefing(entrada());
    expect(secoes(html).map(([, t]) => t)).toEqual([...SECOES_DO_DEBRIEFING]);
    expect(html).toContain("Debriefing — <b>PG02</b> (Expert Teste) · edição única");
    expect(html).not.toContain('class="twin"');
    expect(html).not.toMatch(/class="delta (up|down)"/);
    const dif = html.split('data-secao="Diferenças de Valores e Taxas"')[1]!.split("</section>")[0]!;
    expect(dif).toContain("Seção omitida — edição única");
    expect(dif).not.toContain("<table");
  });

  it("sem order bump nem combo: a seção de esteira vira nota", () => {
    const p = payloadSintetico();
    p.dinheiroTempo.captacao.vendasPorTipo.order_bump = 0;
    p.dinheiroTempo.captacao.vendasPorTipo.combo = 0;
    const html = renderDebriefing(entrada({ payload: p }));
    const ob = html.split('data-secao="Order Bump"')[1]!.split("</section>")[0]!;
    expect(ob).toContain("Sem order bump nem combo neste lançamento");
    expect(ob).not.toContain("<canvas");
  });
});

describe("AC4 — identidade visual e componentes", () => {
  const html = renderDebriefing(comComparacao());
  it("paleta e fontes exatas da referência", () => {
    expect(html).toContain(
      ":root{--bg:#121212;--card:#1a1a1a;--card2:#1f1f1f;--line:#2e2e2e;--cream:#f0eeea;--muted:#928e87;\n--gold:#fdcf2b;--green:#00bc7d;--teal:#00bba7;--orange:#fe9a00;--purple:#8e51ff;--red:#fb5d5d;--blue:#4d9fff}",
    );
    expect(html).toContain('font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif');
  });
  it("classes canônicas presentes", () => {
    for (const c of ["sec-head", "sec-num", "sec-desc", "kpis", "kpi", "lbl", "twin", "tnote", "chart-card", "chart-grid", "chart-box", "tbl-wrap", "insight", "tag t-", "rec", "warn", "note"]) {
      expect(html, c).toContain(c);
    }
  });
  it("nenhum CSS/fonte externos: só os dois scripts", () => {
    expect(html).not.toMatch(/<link\b/);
    expect([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])).toEqual([CHART_JS_URL, DATALABELS_URL]);
  });
});

describe("AC5 — gráficos e const D", () => {
  const html = renderDebriefing(comComparacao());
  it("versões FIXAS (4.4.1 e 2.2.0), nunca @4", () => {
    expect(CHART_JS_URL).toBe("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js");
    expect(DATALABELS_URL).toBe("https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js");
    expect(html).not.toContain("chart.js@4");
  });
  it("UM só `const D`, parseável, com um gráfico por canvas", () => {
    expect(html.match(/const D=/g)).toHaveLength(1);
    const d = dadosD(html);
    const canvases = [...html.matchAll(/<canvas id="([^"]+)"/g)].map((m) => m[1]);
    expect(Object.keys(d.graficos).sort()).toEqual([...canvases].sort());
    expect(canvases.length).toBeGreaterThan(10);
  });
  it("datalabels em todos os gráficos (registrado e com formatter em todo dataset)", () => {
    expect(html).toContain("Chart.register(ChartDataLabels)");
    expect(html).toMatch(/datalabels:\{color:CREAM[\s\S]*?formatter:function/);
  });
  it("sem a CDN o documento declara o gráfico ausente (não quebra as tabelas)", () => {
    expect(html).toContain("if(typeof Chart==='undefined')");
    // As abas ficam num script próprio, ANTES do de gráficos.
    expect(html.indexOf("document.querySelectorAll('.nav button')")).toBeLessThan(html.indexOf("const D="));
  });
});

describe("AC6 — padrões aprovados pelo cliente", () => {
  it("evolução diária com eixo D/D+n e data de calendário só no tooltip; investimento empilhado POR ETAPA", () => {
    const d = dadosD(renderDebriefing(entrada()));
    const inv = d.graficos.cInvest!;
    expect(inv.empilhado).toBe(true);
    expect(inv.rotulos.every((r) => /^D(\+\d+|-\d+)?$|^D0$/.test(r))).toBe(true);
    expect(inv.datas!.every((x) => /^\d{2}\/\d{2}\/\d{2}$/.test(x))).toBe(true);
    // duas etapas com mídia na entrada sintética → duas séries empilhadas
    expect(inv.series.length).toBe(Object.keys(payloadSintetico().dinheiroTempo.midia.porEtapa).length);
  });
  it("Tabela 2 vira lacuna (sem tabela vazia) e Front não é segmento", () => {
    const html = renderDebriefing(entrada());
    expect(html).toContain("Tabela 2 não construída");
    expect(html).toContain("Front não é segmento neste produto");
    expect(html).not.toMatch(/<td>Front<\/td>/);
  });
  it("só-closer é linha própria, separada de Sem track, nas duas tabelas", () => {
    const html = renderDebriefing(entrada());
    expect(html).toContain("Aquisição não rastreada (só closer)");
    expect(html).toMatch(/<td>Sem track<\/td>/);
    expect(html).toMatch(/<td><span class="r">Sem track real<\/span><\/td>/);
  });
});

describe("AC7 — zero literal narrativo", () => {
  it("dois payloads de direções OPOSTAS mudam verbos, tags e classes do Δ", () => {
    const alto = payloadSintetico();
    const baixo = clone(alto);
    baixo.dinheiroTempo.ingressosUnicos = alto.dinheiroTempo.ingressosUnicos * 2;
    baixo.dinheiroTempo.roasCaptacao.valor = (alto.dinheiroTempo.roasCaptacao.valor ?? 1) / 2;
    const subindo = renderDebriefing(comComparacao(baixo, alto)); // atual = baixo
    const caindo = renderDebriefing(comComparacao(alto, baixo)); // atual = alto
    const bloco = (h: string) => h.split('data-secao="Principais Pontos &amp; Recomendações"')[1]!.split("</section>")[0]!;
    expect(bloco(subindo)).toContain("Ingressos (compradores de captação únicos) subiu");
    expect(bloco(caindo)).toContain("Ingressos (compradores de captação únicos) caiu");
    expect(bloco(subindo)).toContain("ROAS Captação (ingresso + combo + bump) caiu");
    expect(bloco(caindo)).toContain("ROAS Captação (ingresso + combo + bump) subiu");
    const tagsDe = (h: string) => [...bloco(h).matchAll(/class="tag (t-good|t-watch)"/g)].map((m) => m[1]);
    expect(tagsDe(subindo)).not.toEqual(tagsDe(caindo));
    expect(subindo).toContain("▲ +100,0%");
    expect(caindo).toContain("▼ −50,0%");
    // a CLASSE do Δ no KPI (verde/vermelho) também segue a direção
    const kpiIngressos = (h: string) => h.split('<div class="lbl">Ingressos (compradores de captação únicos)</div>')[1]!.split('<div class="kpi">')[0]!;
    expect(kpiIngressos(subindo)).toContain('class="delta up"');
    expect(kpiIngressos(caindo)).toContain('class="delta down"');
  });

  it("taxa usa Δpp; volume usa Δ%", () => {
    const a = payloadSintetico();
    const b = clone(a);
    b.dinheiroTempo.conversaoIngressoPrincipal.valor = (a.dinheiroTempo.conversaoIngressoPrincipal.valor ?? 0) - 0.1;
    const html = renderDebriefing(comComparacao(b, a));
    expect(html).toMatch(/▼ −10,0 pp/);
  });

  it("nenhum número em formato US no texto visível; moeda R$ pt-BR; 's/ TMB' onde há faturamento", () => {
    const html = renderDebriefing(comComparacao());
    // Referências de story ("49.7", "Story 49.8") não são números do relatório.
    const t = textoVisivel(html).replace(/\b49\.\d{1,2}\b/g, "");
    expect(t).not.toMatch(/\d,\d{3}\.\d/); // 1,234.56
    expect(t).not.toMatch(/(?<![\w.-])\d+\.\d{1,2}(?![\d\w-])%?/); // 12.5 / 0.25% (versão "49.2-v2" não conta)
    expect(t).toMatch(/R\$ \d{1,3}(\.\d{3})*,\d{2}/);
    expect(t).toContain("s/ TMB");
    expect(t).toContain("Ingressos");
  });

  it("alertas viram banner no topo, por código com contagem, sem bloquear", () => {
    const html = renderDebriefing(entrada({ alertas: [{ codigo: "WF5", quantidade: 3, mensagem: "etapa sem link_click" }] }));
    const banner = html.split("data-alertas")[1]!.split("</div>")[0]!;
    expect(banner).toContain("<b>WF5</b> (3) — etapa sem link_click");
    expect(html.indexOf("data-alertas")).toBeLessThan(html.indexOf('class="nav"'));
  });
});

describe("AC8 — lacunas declaradas renderizadas", () => {
  const html = renderDebriefing(entrada());
  it("cada lacuna no lugar do bloco que faltaria, com explicação", () => {
    expect(html).toContain("Listas-mestre Front / Comunidade");
    expect(html).toContain("Ingressos por dia");
    expect(html).toContain("não existe no Loyola"); // # Leads do Debriefing diário (LEADS_DO_PAINEL)
    expect(html).toContain("Mídia por criativo indisponível");
    expect(html).toContain("Datas-chave informadas pelo usuário no formulário");
  });
  it("vendas excluídas automaticamente listadas com txId, valor, data e motivo", () => {
    const exc = payloadSintetico().dinheiroTempo.vendasExcluidas[0]!;
    expect(html).toContain('data-lacuna="VENDAS_EXCLUIDAS_AUTOMATICAMENTE"');
    expect(html).toContain(`<td>${exc.txId}</td>`);
    expect(html).toContain("ANTERIOR_A_ABERTURA");
  });
  it("IA×Humano sem nomenclatura: dimensão não exibida, dito no documento", () => {
    const p = payloadSintetico();
    p.publico.tipoDeCriativo.aplicavel = false;
    p.publico.tipoDeCriativo.motivo = "SEM_NOMENCLATURA_DO_EXPERT";
    const h = renderDebriefing(entrada({ payload: p }));
    expect(h).toContain("não exibida — SEM_NOMENCLATURA_DO_EXPERT");
  });
});

describe("AC9 — restrições do documento", () => {
  it("sem storage, cookies nem window.open", () => {
    for (const h of [renderDebriefing(entrada()), renderDebriefing(comComparacao())]) {
      expect(h).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|window\.open/);
    }
  });
  it("nomes de planilha/Meta/UTM escapados; todo target=_blank com rel noopener noreferrer", () => {
    const p = payloadSintetico();
    const xss = '<script>alert("x")</script>';
    p.dinheiroTempo.auditoriaDeVendas[0]!.produto = xss;
    p.dinheiroTempo.auditoriaDeVendas[0]!.utmVenda.campaign = xss;
    p.publico.criativoXFaixa.aplicavel = true;
    p.publico.criativoXFaixa.criativos = [
      {
        nome: xss,
        nomeNaoResolvido: false,
        origemDoNome: "cache",
        adIds: ["1"],
        adIdPrincipal: "1",
        n: 1,
        porFaixa: { A: 1, B: 0, C: 0, D: 0, semFaixa: 0, foraDoPadrao: 0 },
        pctAB: { valor: 100, memoria: "" },
        pctCD: { valor: 0, memoria: "" },
        pctSemFaixa: { valor: 0, memoria: "" },
        amostraBaixa: true,
        tipo: null,
        linkAdsManager: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=1&selected_ad_ids=1"><script>',
      },
    ];
    const html = renderDebriefing(entrada({ payload: p, rotulos: { ...ROT, projeto: xss, lancamento: xss } }));
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    const blanks = [...html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
    expect(blanks.length).toBeGreaterThan(0);
    for (const a of blanks) expect(a).toContain('rel="noopener noreferrer"');
    // `const D` não fecha o <script> com nome malicioso
    expect(html.split("const D=")[1]!.split("</script>")[0]).not.toContain("<");
  });
});

describe("AC10 — render puro", () => {
  it("mesma entrada → mesmo HTML; o arquivo não lê relógio nem aleatório", () => {
    const e = entrada();
    expect(renderDebriefing(e)).toBe(renderDebriefing(e));
    const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "services", "debriefing-render.ts"), "utf8");
    expect(fonte).not.toMatch(/Date\.now|Math\.random|new Date\(\)/);
    expect(fonte).not.toMatch(/from "\.\.\/db|drizzle/);
  });
  it("imposto nunca reaplicado: o investimento exibido é o do payload, e a procedência aparece", () => {
    const p = payloadSintetico();
    const html = renderDebriefing(entrada({ payload: p }));
    expect(html).toContain(moedaBr(p.dinheiroTempo.midia.investimentoTotal.valor!));
    expect(html).toContain(`procedência: <b>${p.dinheiroTempo.imposto.impostoOrigem}</b>`);
    expect(html).not.toContain(moedaBr(p.dinheiroTempo.midia.investimentoTotal.valor! * 1.13));
  });
  it("CTR/CPC e % Compradores/Cliques nulos → —, nunca 0", () => {
    const p = payloadSintetico();
    p.dinheiroTempo.midia.porGrupo.captacao.ctr = { valor: null, memoria: "", motivo: "SEM_LINK_CLICK" };
    p.dinheiroTempo.midia.porGrupo.captacao.cpc = { valor: null, memoria: "", motivo: "SEM_LINK_CLICK" };
    p.dinheiroTempo.captacao.pctCompradoresPorCliques = { valor: null, memoria: "", motivo: "SEM_LINK_CLICK" };
    const html = renderDebriefing(entrada({ payload: p }));
    for (const rot of ["CTR (link) — captação", "CPC (link) — captação", "% Compradores / Cliques"]) {
      const kpi = html.split(`<div class="lbl">${rot}</div>`)[1]!.split('<div class="kpi">')[0]!;
      expect(kpi, rot).toContain("<b>—</b>");
      expect(kpi, rot).toContain("SEM_LINK_CLICK");
    }
  });
});

describe("REL-002 — tabelas estáticas (a edição inline sobrevive ao reabrir)", () => {
  it("nenhuma tabela é montada por script: o JS só lê D e desenha canvas", () => {
    const html = renderDebriefing(comComparacao());
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    const auditoria = payloadSintetico().dinheiroTempo.auditoriaDeVendas.length;
    const aud = html.split("Auditoria — todas as vendas do principal")[1]!.split("</table>")[0]!;
    expect(aud.match(/<tr>/g)!.length - 1).toBe(auditoria); // −1 = cabeçalho
  });
});

describe("49.11 AC9 — série histórica com a composição", () => {
  it("dimensão série: diz de quantos lançamentos e quais; ausente diz em quais falta; Definições lista a ordem e a principal", () => {
    const p = payloadSintetico();
    p.config.lancamentosComparacao = ["f-b", "f-c"];
    p.config.lancamentoComparacaoFunnelId = "f-b";
    p.publico.serieHistorica = {
      lancamentos: [
        { funnelId: "f-b", nome: "PG01", posicao: 1, principal: true },
        { funnelId: "f-c", nome: "PG00", posicao: 2, principal: false },
      ],
    };
    p.publico.dimensoes[0]!.serieHistorica = true;
    p.publico.dimensoes[0]!.serieHistoricaMotivo = "PRESENTE_EM_TODOS_OS_LANCAMENTOS";
    p.publico.dimensoes[1]!.serieHistorica = false;
    p.publico.dimensoes[1]!.serieHistoricaMotivo = "AUSENTE_EM_LANCAMENTO_DA_LISTA";
    p.publico.dimensoes[1]!.lancamentosAusentes = ["f-c"];
    const html = renderDebriefing(comComparacao(p));
    expect(html).toContain("<b>série histórica</b> em 3 lançamentos (este + 2: PG01, PG00)");
    expect(html).toContain("não é série — a pergunta falta em: PG00");
    expect(html).toContain("1. PG01 <b>(principal — Δ e título)</b> · 2. PG00");
    // título continua com B = a principal
    expect(html).toContain("Debriefing Comparativo <b>PG02</b> × <b>PG01</b>");
  });
});
