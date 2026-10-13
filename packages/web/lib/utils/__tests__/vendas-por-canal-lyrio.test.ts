/**
 * Story 42.12 — as vendas do Lyrio por canal, do lado do painel.
 *
 * As funções puras (estado do bloco, Resumo por canal, quebra do bloco,
 * declarações, cruzamento com o Detalhamento) e o FIO até a tela: os `.tsx`
 * de `components/funnels` não são coletados (`environment: node`, sem jsdom),
 * então as ligações são provadas lendo o fonte — o padrão da 42.11.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calcularMargemContribuicao } from "../lyrio-margin";
import {
  DECLARACAO_FONTE_DO_RESUMO,
  avisoDeConflito,
  blocoMetaDoLyrio,
  chaveDaLinhaDoDetalhamento,
  declaracaoDeCobertura,
  declaracaoForaDaQuebra,
  estadoDasVendasPorCanal,
  linhasDoResumoPorCanal,
  linhasPorCanalDoBloco,
  rotuloDoNaoIdentificado,
  vendasDoDetalhamento,
  type VendasPorCanalDoLyrio,
} from "../vendas-por-canal-lyrio";

const zero = { vendas: 0, compradores: 0, receitaUsd: 0 };
const dados = (p: Partial<VendasPorCanalDoLyrio> = {}): VendasPorCanalDoLyrio => ({
  days: 28,
  desde: "2026-09-15",
  atributosDesde: "2026-10-06",
  canais: [
    { canal: "meta", rotulo: "Meta", vendas: 23, compradores: 23, receitaUsd: 105.24 },
    { canal: "google", rotulo: "Google", vendas: 125, compradores: 125, receitaUsd: 1206.6 },
    { canal: "organico", rotulo: "Orgânico ou cupom", vendas: 45, compradores: 45, receitaUsd: 391.49 },
    { canal: "sem_atribuicao", rotulo: "Sem atribuição", vendas: 93, compradores: 92, receitaUsd: 952.05 },
  ],
  conflito: zero,
  totalPago: { vendas: 286, compradores: 285, receitaUsd: 2655.38 },
  metaPorEntidade: { campaign: [], adset: [], ad: [] },
  foraDaQuebra: { semValor: 432, semUsuario: 0 },
  ...p,
});
const erroHttp = (status: number, message: string) => Object.assign(new Error(message), { status });

describe("estadoDasVendasPorCanal — 404 × erro (AC7)", () => {
  it("404 da ROTA (API anterior à 42.12) → oculto; 404 de domínio, 5xx e rede → erro; erro com cache → erro", () => {
    expect(estadoDasVendasPorCanal({ isLoading: false, error: erroHttp(404, "Not Found"), data: undefined })).toEqual({ tipo: "oculto" });
    expect(estadoDasVendasPorCanal({ isLoading: false, error: erroHttp(404, "Etapa não encontrada"), data: undefined })).toEqual({ tipo: "erro", mensagem: "Etapa não encontrada" });
    expect(estadoDasVendasPorCanal({ isLoading: false, error: new TypeError("Failed to fetch"), data: undefined })).toEqual({ tipo: "erro", mensagem: "Failed to fetch" });
    expect(estadoDasVendasPorCanal({ isLoading: false, error: erroHttp(500, "x"), data: dados() }).tipo).toBe("erro");
  });
  it("carregando e pronto", () => {
    expect(estadoDasVendasPorCanal({ isLoading: true, error: null, data: undefined })).toEqual({ tipo: "carregando" });
    const d = dados();
    expect(estadoDasVendasPorCanal({ isLoading: false, error: null, data: d })).toEqual({ tipo: "pronto", dados: d });
  });
});

describe("declarações (AC6, PO-03, D7)", () => {
  it("cobertura com a data VINDA DA API: janela que começa antes subconta Meta e Google", () => {
    expect(declaracaoDeCobertura(dados())).toBe(
      "O canal da venda (ad_network e ids da Meta) só chega desde 06/10/2026. Esta janela começa antes, então Meta e Google estão subcontados — o que falta cai em Sem atribuição.",
    );
    expect(declaracaoDeCobertura(dados({ desde: "2026-10-08" }))).toBe("O canal da venda (ad_network e ids da Meta) chega desde 06/10/2026.");
    // outra data, outra frase — uma data fixa no código seria pega aqui
    expect(declaracaoDeCobertura(dados({ atributosDesde: "2026-11-03" }))).toMatch(/desde 03\/11\/2026\. Esta janela começa antes/);
    expect(declaracaoDeCobertura(dados({ atributosDesde: null }))).toMatch(/ainda não enviou o canal.*não quer dizer que não vendam/);
  });
  it("o que fica fora da quebra, com número; nada quando não há", () => {
    expect(declaracaoForaDaQuebra(dados())).toBe("“Por canal” conta só venda paga: 432 eventos de US$ 0 (teste grátis, promocional) entram no card “Vendas” e ficam fora daqui.");
    expect(declaracaoForaDaQuebra(dados({ foraDaQuebra: { semValor: 1, semUsuario: 0 } }))).toMatch(/1 evento de US\$ 0 .* entra no card “Vendas” e fica fora daqui\./);
    expect(declaracaoForaDaQuebra(dados({ foraDaQuebra: { semValor: 2, semUsuario: 1 } }))).toMatch(/2 eventos de US\$ 0 .* e 1 venda sem usuário do app entram/);
    expect(declaracaoForaDaQuebra(dados({ foraDaQuebra: { semValor: 0, semUsuario: 0 } }))).toBeNull();
  });
  it("conflito (D7): aviso só quando existe; e a fonte do Resumo declarada", () => {
    expect(avisoDeConflito(0)).toBeNull();
    expect(avisoDeConflito(1)).toMatch(/^1 usuário tem sinal da Meta e do Google ao mesmo tempo — possível falha na integração\. Ficou fora/);
    expect(avisoDeConflito(3)).toMatch(/^3 usuários têm .* Ficaram fora/);
    expect(DECLARACAO_FONTE_DO_RESUMO).toMatch(/webhook.*overview.*não batem/);
  });
});

describe("linhasDoResumoPorCanal — ROAS e Margem por canal (AC2)", () => {
  const percentuais = { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 };
  const base = {
    dados: dados(),
    brlRate: 5,
    meta: { liquidoBrl: 1000, impostoBrl: 138.29, conhecido: true },
    google: { investimentoBrl: 2000, conhecido: true },
    percentuais,
  };

  it("Meta contra o investimento da Meta COM o imposto; Google contra o do Google SEM imposto", () => {
    const l = linhasDoResumoPorCanal(base);
    const meta = l.find((x) => x.chave === "meta")!;
    expect(meta.receitaBrl).toBeCloseTo(526.2, 6);
    expect(meta.investimentoBrl).toBeCloseTo(1138.29, 6);
    expect(meta.roas).toBeCloseTo(526.2 / 1138.29, 9);
    expect(meta.margemBrl).toBe(
      calcularMargemContribuicao({ faturamentoBrutoBrl: 526.2, ...percentuais, investimentoMetaLiquidoBrl: 1000, impostoMetaBrl: 138.29, investimentoGoogleBrl: 0 }).margem,
    );
    const google = l.find((x) => x.chave === "google")!;
    expect(google.investimentoBrl).toBe(2000);
    expect(google.roas).toBeCloseTo(6033 / 2000, 9);
    expect(google.margemBrl).toBe(
      calcularMargemContribuicao({ faturamentoBrutoBrl: 6033, ...percentuais, investimentoMetaLiquidoBrl: 0, impostoMetaBrl: 0, investimentoGoogleBrl: 2000 }).margem,
    );
  });
  it("orgânico e sem atribuição só têm receita; Total pago no fim", () => {
    const l = linhasDoResumoPorCanal(base);
    expect(l.map((x) => x.rotulo)).toEqual(["Meta", "Google", "Orgânico ou cupom", "Sem atribuição", "Total pago"]);
    for (const x of l.filter((y) => y.chave === "organico" || y.chave === "sem_atribuicao" || y.chave === "total")) {
      expect([x.investimentoBrl, x.roas, x.margemBrl]).toEqual([null, null, null]);
    }
    expect(l.at(-1)?.vendas).toBe(286);
    expect(l.at(-1)?.receitaBrl).toBeCloseTo(13276.9, 6);
  });
  it("investimento DESCONHECIDO (sem campanha vinculada ou carregando) → “—”, nunca R$ 0 com ROAS/margem falsos", () => {
    const l = linhasDoResumoPorCanal({ ...base, meta: { ...base.meta, conhecido: false }, google: { investimentoBrl: 0, conhecido: false } });
    for (const canal of ["meta", "google"]) {
      expect(l.find((x) => x.chave === canal)).toMatchObject({ investimentoBrl: null, roas: null, margemBrl: null });
    }
    // investimento conhecido e zero → ROAS "—" (divisão por zero), margem calculada
    const z = linhasDoResumoPorCanal({ ...base, google: { investimentoBrl: 0, conhecido: true } }).find((x) => x.chave === "google")!;
    expect(z.roas).toBeNull();
    expect(z.margemBrl).not.toBeNull();
  });
  it("sem câmbio → receita, ROAS e margem “—”; conflito vira linha só quando existe", () => {
    const l = linhasDoResumoPorCanal({ ...base, brlRate: null });
    expect(l.every((x) => x.receitaBrl === null && x.roas === null && x.margemBrl === null)).toBe(true);
    const c = linhasDoResumoPorCanal({ ...base, dados: dados({ conflito: { vendas: 1, compradores: 1, receitaUsd: 2 } }) });
    expect(c.map((x) => x.chave)).toEqual(["meta", "google", "organico", "sem_atribuicao", "conflito", "total"]);
  });
});

describe("linhasPorCanalDoBloco — a quebra do bloco RevenueCat (AC3)", () => {
  it("4 canais + Total pago; conflito só quando existe; a soma fecha com o total", () => {
    const l = linhasPorCanalDoBloco(dados());
    expect(l.map((x) => x.label)).toEqual(["Meta", "Google", "Orgânico ou cupom", "Sem atribuição", "Total pago"]);
    const soma = l.slice(0, -1).reduce((a, x) => a + x.sales, 0);
    expect(soma).toBe(l.at(-1)!.sales);
    expect(linhasPorCanalDoBloco(dados({ conflito: { vendas: 1, compradores: 1, receitaUsd: 1 } })).map((x) => x.label)).toContain("Meta e Google (conflito)");
  });
});

describe("vendasDoDetalhamento — cruzamento com as linhas (AC5)", () => {
  const ent = (chave: string | null, vendas: number, receitaUsd: number) => ({ chave, nome: chave, vendas, compradores: vendas, receitaUsd });
  const d = dados({
    canais: [{ canal: "meta", rotulo: "Meta", vendas: 10, compradores: 10, receitaUsd: 50 }, ...dados().canais.slice(1)],
    metaPorEntidade: {
      campaign: [ent("c1", 6, 30), ent("c-nao-vinculada", 2, 6), ent(null, 2, 14)],
      adset: [],
      ad: [ent("ads-07", 7, 35), ent(null, 2, 14), ent("ads-renomeado", 1, 1)],
    },
  });

  it("campanha casa pelo ID; Google fica de fora (→ “—”); campanha sem linha e não identificado aparecem; o total fecha", () => {
    const linhas = [
      { id: "c1", name: "app_ios", platform: "meta" },
      { id: "c2", name: "app_android", platform: "meta" },
      { id: "g1", name: "google app", platform: "google" },
    ];
    const v = vendasDoDetalhamento("campaign", linhas, d);
    expect(v.porLinha.get("meta-c1")).toEqual({ vendas: 6, compradores: 6, receitaUsd: 30 });
    expect(v.porLinha.get("meta-c2")).toEqual({ vendas: 0, compradores: 0, receitaUsd: 0 });
    expect(v.porLinha.has("google-g1")).toBe(false);
    expect(v.semLinha).toEqual({ vendas: 2, compradores: 2, receitaUsd: 6 });
    expect(v.naoIdentificado).toEqual({ vendas: 2, compradores: 2, receitaUsd: 14 });
    const soma = [...v.porLinha.values()].reduce((a, x) => a + x.vendas, 0) + v.naoIdentificado!.vendas + v.semLinha!.vendas;
    expect(soma).toBe(v.totalMeta.vendas);
  });
  it("anúncio casa pelo NOME aparado (a linha do /all-ads guarda um id representante); cada entidade vai para UMA linha", () => {
    const linhas = [
      { id: "120248264966950452", name: " ads-07 ", platform: "meta" },
      { id: "999", name: "ads-07", platform: "meta" },
    ];
    expect(chaveDaLinhaDoDetalhamento("ad", linhas[0])).toBe("ads-07");
    expect(chaveDaLinhaDoDetalhamento("campaign", linhas[0])).toBe("120248264966950452");
    expect(chaveDaLinhaDoDetalhamento("ad", { id: "g", name: "x", platform: "google" })).toBeNull();
    const v = vendasDoDetalhamento("ad", linhas, d);
    expect(v.porLinha.get("meta-120248264966950452")?.vendas).toBe(7);
    expect(v.porLinha.get("meta-999")?.vendas).toBe(0);
    expect(v.semLinha).toEqual({ vendas: 1, compradores: 1, receitaUsd: 1 });
  });
  it("sem entidade de um tipo → nada extra; nível sem quebra ainda devolve o total da Meta", () => {
    const v = vendasDoDetalhamento("adset", [{ id: "a", name: "auto", platform: "meta" }], d);
    expect(v.naoIdentificado).toBeNull();
    expect(v.semLinha).toBeNull();
    expect(v.totalMeta.vendas).toBe(10);
  });
});

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

describe("o fio até a tela", () => {
  const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
  const resumo = ler("../../../components/funnels/lyrio-resumo-por-canal.tsx");
  const detalhe = ler("../../../components/funnels/lyrio-detail-table.tsx");
  const hooks = ler("../../hooks/use-revenuecat.ts");

  it("o hook chama a rota com days, sem retry no 404, e só quando habilitado", () => {
    expect(hooks).toMatch(/\/stages\/\$\{stageId\}\/revenuecat\/vendas-por-canal\?days=\$\{days\}/);
    expect(hooks).toMatch(/queryKey: \["revenuecat-vendas-por-canal", stageId, days\]/);
    const corpo = hooks.slice(hooks.indexOf("export function useRevenuecatVendasPorCanal"));
    expect(corpo).toMatch(/retry: tentarDeNovoAJornada/);
    expect(corpo).toMatch(/enabled,/);
  });
  it("Resumo: 28 dias, investimento só conhecido com campanha vinculada E dado carregado, dentro da seção do Resumo", () => {
    expect(resumo).toMatch(/export const JANELA_DO_RESUMO = 28;/);
    expect(resumo).toMatch(/useRevenuecatVendasPorCanal\(projectId, funnelId, stageId, JANELA_DO_RESUMO\)/);
    expect(resumo).toMatch(/if \(estado\.tipo === "oculto"\) return null;/);
    expect(resumo).toMatch(/estado\.tipo === "erro" \? \(\s*<p role="alert"/);
    expect(resumo).toMatch(/linhasDoResumoPorCanal\(\{ dados: estado\.dados, brlRate, meta, google, percentuais \}\)/);
    expect(resumo).toMatch(/declaracaoDeCobertura\(estado\.dados\)/);
    expect(etapa).toMatch(/conhecido: campaignIds\.length > 0 && metaDaily28 !== undefined/);
    // Story 42.13 (AC1b): o investimento do Google é conhecido só com a consulta respondida — erro não é R$ 0.
    expect(etapa).toMatch(/conhecido: googleAtivo && googleSpend28Conhecido !== null/);
    expect(etapa).toMatch(/liquidoBrl: metaSpend28Detalhe\.spendLiquido,\s*impostoBrl: metaSpend28Detalhe\.imposto,/);
    const secao = etapa.slice(etapa.indexOf("Resumo mobile · últimos 28 dias"), etapa.indexOf("</section>", etapa.indexOf("Resumo mobile · últimos 28 dias")));
    expect(secao).toContain("<LyrioResumoPorCanal");
  });
  it("bloco RevenueCat: a quebra usa a MESMA janela (`days`) e o estado (oculto some, erro aparece)", () => {
    expect(etapa).toMatch(/useRevenuecatVendasPorCanal\(projectId, funnelId, stage\.id, days, connected\)/);
    expect(etapa).toMatch(/porCanal=\{vendasPorCanal\}/);
    expect(etapa).toMatch(/porCanal\.tipo === "erro" && \(\s*<p role="alert"/);
    expect(etapa).toMatch(/rows=\{linhasPorCanalDoBloco\(porCanal\.dados\)\}/);
    expect(etapa).toMatch(/declaracaoForaDaQuebra\(porCanal\.dados\), declaracaoDeCobertura\(porCanal\.dados\)/);
    expect(etapa).not.toMatch(/porCanal\.tipo === "oculto"/);
  });
  it("Detalhamento: mesma janela, vendas por linha pela função pura, colunas somem com a API anterior", () => {
    expect(etapa).toMatch(/<LyrioDetailTable\s+projectId=\{projectId\}\s+funnelId=\{funnelId\}\s+stageId=\{stage\.id\}\s+brlRate=\{brlRate\}\s+revenuecatConectado=\{connected\}/);
    expect(detalhe).toMatch(/useRevenuecatVendasPorCanal\(projectId, funnelId, stageId, days, revenuecatConectado && temMeta\)/);
    expect(detalhe).toMatch(/const mostraVendas = revenuecatConectado && temMeta && estadoVendas\.tipo !== "oculto";/);
    expect(detalhe).toMatch(/vendasDoDetalhamento\(dimensao, rows, estadoVendas\.dados\)/);
    expect(detalhe).toMatch(/r\.platform === "meta" && vendas \? \(vendas\.porLinha\.get\(`\$\{r\.platform\}-\$\{r\.id\}`\) \?\? null\) : null/);
    // Story 42.13 (AC3): o rótulo vem da dimensão ativa, não fixo.
    expect(detalhe).toMatch(/const naoIdentificado = rotuloDoNaoIdentificado\(dimensao\);/);
    expect(detalhe).toMatch(/\[naoIdentificado\.rotulo, vendas\.naoIdentificado, naoIdentificado\.dica\]/);
    expect(detalhe).not.toContain('"Anúncio não identificado"');
    expect(detalhe).toContain("Sem linha nesta tabela");
  });
});

describe("Story 42.13 (AC3) — rotuloDoNaoIdentificado acompanha a dimensão", () => {
  it("campanha, conjunto e anúncio, cada um com o seu nível na dica", () => {
    expect(rotuloDoNaoIdentificado("campaign")).toEqual({ rotulo: "Campanha não identificada", dica: expect.stringContaining("id da campanha") });
    expect(rotuloDoNaoIdentificado("adset")).toEqual({ rotulo: "Conjunto não identificado", dica: expect.stringContaining("id do conjunto") });
    expect(rotuloDoNaoIdentificado("ad")).toEqual({ rotulo: "Anúncio não identificado", dica: expect.stringContaining("id do anúncio") });
  });
});

describe("Story 42.13 (AC2) — blocoMetaDoLyrio: a venda da Meta vem do RevenueCat", () => {
  const pronto = { tipo: "pronto" as const, dados: dados() };
  const trafego = { investimentoBrl: 504.69, impressoes: 89482, cliques: 2589 };

  it("vendas e receita do canal Meta; ROAS e custo por venda contra o investimento da Meta", () => {
    const b = blocoMetaDoLyrio({ ...trafego, estado: pronto, brlRate: 5.4 });
    expect(b.vendas).toBe(23);
    expect(b.receitaBrl).toBeCloseTo(105.24 * 5.4, 10);
    expect(b.roas).toBeCloseTo((105.24 * 5.4) / 504.69, 10);
    expect(b.custoPorVenda).toBeCloseTo(504.69 / 23, 10);
    expect(b.ctr).toBeCloseTo((2589 / 89482) * 100, 10);
    expect(b.cpm).toBeCloseTo((504.69 * 1000) / 89482, 10);
    expect(b.conversao).toBeCloseTo((23 / 2589) * 100, 10);
  });
  it("não lê o Google nem o total: só a linha Meta", () => {
    const so = dados({ canais: dados().canais.map((c) => (c.canal === "meta" ? { ...c, vendas: 2, receitaUsd: 10 } : c)) });
    const b = blocoMetaDoLyrio({ ...trafego, estado: { tipo: "pronto", dados: so }, brlRate: 5 });
    expect(b.vendas).toBe(2);
    expect(b.receitaBrl).toBe(50);
  });
  it("sem câmbio: receita e ROAS ficam null (nunca US$ disfarçado de R$); as vendas continuam", () => {
    const b = blocoMetaDoLyrio({ ...trafego, estado: pronto, brlRate: null });
    expect(b).toMatchObject({ vendas: 23, receitaBrl: null, roas: null });
    expect(b.custoPorVenda).toBeCloseTo(504.69 / 23, 10);
  });
  it("divisões por zero viram null: sem investimento, sem venda, sem impressão, sem clique", () => {
    const zerado = dados({ canais: dados().canais.map((c) => (c.canal === "meta" ? { ...c, vendas: 0, compradores: 0, receitaUsd: 0 } : c)) });
    const b = blocoMetaDoLyrio({ investimentoBrl: 0, impressoes: 0, cliques: 0, estado: { tipo: "pronto", dados: zerado }, brlRate: 5 });
    expect(b).toMatchObject({ vendas: 0, receitaBrl: 0, roas: null, custoPorVenda: null, ctr: null, cpm: null, conversao: null });
    // com investimento e zero vendas, o custo por venda é desconhecido, não Infinity
    expect(blocoMetaDoLyrio({ ...trafego, estado: { tipo: "pronto", dados: zerado }, brlRate: 5 }).custoPorVenda).toBeNull();
  });
  it("venda desconhecida (carregando, erro, API anterior à rota) → vendas e receita null, nunca 0", () => {
    for (const estado of [{ tipo: "carregando" as const }, { tipo: "oculto" as const }, { tipo: "erro" as const, mensagem: "x" }]) {
      const b = blocoMetaDoLyrio({ ...trafego, estado, brlRate: 5 });
      expect(b).toMatchObject({ vendas: null, receitaBrl: null, roas: null, custoPorVenda: null, conversao: null });
      expect(b.investimentoBrl).toBe(504.69);
    }
  });
});

describe("Story 42.13 — o fio até a tela", () => {
  const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
  const bloco = ler("../../../components/funnels/lyrio-meta-kpis.tsx");
  const detalhe = ler("../../../components/funnels/lyrio-detail-table.tsx");

  it("AC2 — o bloco Meta do Lyrio é o novo, com o MESMO estado de vendas do bloco RevenueCat; SalesMetaKpis saiu da etapa", () => {
    expect(etapa).not.toMatch(/<SalesMetaKpis/);
    expect(etapa).toMatch(/<LyrioMetaKpis\s+projectId=\{projectId\}\s+campaignIds=\{campaignIds\}\s+days=\{days\}\s+vendas=\{vendasPorCanal\}\s+revenuecatConectado=\{connected\}/);
    expect(bloco).toMatch(/useCampaignDailyInsightsBulk\(\s*projectId,\s*campaignIds\.length > 0 \? campaignIds : null,\s*days,\s*\)/);
    expect(bloco).toMatch(/blocoMetaDoLyrio\(\{/);
    expect(bloco).toMatch(/const estado: EstadoDasVendas = revenuecatConectado \? vendas : \{ tipo: "oculto" \};/);
    expect(bloco).not.toMatch(/label="(LP Views|Checkouts|Ticket)/);
  });
  it("AC1 — Google: o bloco e o Resumo decidem pelo estado; ROAS e Margem somem com o Google desconhecido", () => {
    const kpis = etapa.slice(etapa.indexOf("function GoogleAdsKpis("));
    expect(kpis).toMatch(/estadoDoGoogle\(\{ isLoading: q\.isLoading, error: q\.error, data: q\.data \}, campaignIds\)/);
    expect(kpis).toMatch(/estado\.tipo === "erro"[\s\S]*role="alert"/);
    expect(etapa).toMatch(/const googleIndisponivel = googleSpend28Conhecido === null;/);
    expect(etapa).toMatch(/investimento28 > 0 && !googleIndisponivel \? revenue28Brl \/ investimento28 : null/);
    expect(etapa).toMatch(/revenue28Brl == null \|\| googleIndisponivel\s*\?\s*null/);
    expect(etapa).toMatch(/value=\{googleIndisponivel \? "—" : fmtBRL\(googleSpend28\)\}/);
    expect(detalhe).toMatch(/temGoogle && dimensao === "campaign" && erroGoogle && \(\s*<p role="alert"/);
  });
});
