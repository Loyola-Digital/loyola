import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alternarAbertura,
  chaveDaLinha,
  contextoDaAbertura,
  diasDaJanela,
  diferencaDaMidia,
  donosDasChaves,
  expansaoDaMeta,
  expansaoDoGoogle,
  indiceDaMidiaDaMeta,
  midiaSemLinha,
  periodoDaSerie,
  precisaDaSerieDaMeta,
  vendasDosDias,
  DICA_API_SEM_VENDA_POR_DIA,
  DICA_ATRIBUICAO_DO_DIA,
  DICA_DIFERENCA_DA_MIDIA,
  DICA_GOOGLE_SEM_VENDA,
  DICA_SEM_COBERTURA_DO_DIA,
  type LinhaDaSerie,
} from "../lyrio-detalhamento-diario";
import { googleRow, metaRow, type LyrioDetailRow } from "../lyrio-detail-rows";
import { hojeNoNegocio } from "../janela-dos-cards-lyrio";
import { comImpostoMeta } from "../meta-tax";
import type { EstadoDasVendas, VendasPorCanalDoLyrio } from "../vendas-por-canal-lyrio";

/**
 * Story 42.19 (AC6a/AC6b) — a função pura da linha expansível do Detalhamento.
 * O fuso do runner é `America/Sao_Paulo` (vitest.config); o relógio é fixado
 * aqui nos testes de "hoje".
 */

const HOJE = "2026-10-28";
const serie = (p: Partial<LinhaDaSerie>): LinhaDaSerie => ({
  entityId: "e",
  entityName: "e",
  dateStart: HOJE,
  spend: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: 0,
  ...p,
});
/** A linha como o Detalhamento a mostra: tributada pelo backend (bruto ÷ (1 − 0,1215)). */
const linhaMeta = (id: string, name: string, bruto: number, impressions: number, linkClicks: number): LyrioDetailRow =>
  metaRow({ campaignId: id, campaignName: name, spend: comImpostoMeta(bruto, HOJE), impressions, clicks: linkClicks, linkClicks });

const pronto = (p: Partial<VendasPorCanalDoLyrio>): EstadoDasVendas => ({
  tipo: "pronto",
  dados: {
    days: 3,
    desde: "2026-10-26",
    atributosDesde: "2026-10-06",
    canais: [],
    conflito: { vendas: 0, compradores: 0, receitaUsd: 0 },
    totalPago: { vendas: 0, compradores: 0, receitaUsd: 0 },
    metaPorEntidade: { campaign: [], adset: [], ad: [] },
    metaPorEntidadeDiario: { campaign: [], adset: [], ad: [] },
    foraDaQuebra: { semValor: 0, semUsuario: 0 },
    ...p,
  },
});

describe("AC1b — os dias da janela, em SP, do mais recente ao mais antigo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("de hoje até inicioDaJanela(days); todo dia aparece; days = 1 é só hoje", () => {
    expect(diasDaJanela(3, HOJE)).toEqual(["2026-10-28", "2026-10-27", "2026-10-26"]);
    expect(diasDaJanela(1, HOJE)).toEqual([HOJE]);
    expect(diasDaJanela(0, HOJE)).toEqual([HOJE]);
    expect(diasDaJanela(28, HOJE)).toHaveLength(28);
    expect(diasDaJanela(28, HOJE).at(-1)).toBe("2026-10-01");
    // virada de mês e de ano
    expect(diasDaJanela(3, "2027-01-01")).toEqual(["2027-01-01", "2026-12-31", "2026-12-30"]);
  });
  it("hoje é o dia de SP: 23:30 de SP (02:30Z do dia seguinte) ainda é o dia de SP", () => {
    vi.setSystemTime(new Date("2026-10-29T02:30:00Z"));
    expect(process.env.TZ).toBe("America/Sao_Paulo");
    const hoje = hojeNoNegocio();
    expect(hoje).toBe("2026-10-28");
    expect(diasDaJanela(2, hoje)).toEqual(["2026-10-28", "2026-10-27"]);
    // a série do entity-daily vai com datas explícitas — o `days` da rota contaria em UTC (29/10)
    expect(periodoDaSerie(7, hoje)).toEqual({ startDate: "2026-10-22", endDate: "2026-10-28" });
  });
  it("hoje leva a marca de dia em andamento; os outros não", () => {
    const linha = linhaMeta("c1", "Campanha", 0, 0, 0);
    const e = expansaoDaMeta({ linha, dias: diasDaJanela(3, HOJE), hoje: HOJE, dimensao: "campaign", serie: new Map(), semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias.map((d) => [d.dia, d.emAndamento])).toEqual([["2026-10-28", true], ["2026-10-27", false], ["2026-10-26", false]]);
  });
});

describe("AC1c / AC2a — abrir, fechar e quando pedir a série", () => {
  it("várias abertas; clicar de novo fecha só aquela; trocar o contexto é outra chave", () => {
    let a: Set<string> = new Set();
    a = alternarAbertura(a, "meta-1");
    a = alternarAbertura(a, "meta-2");
    expect([...a]).toEqual(["meta-1", "meta-2"]);
    a = alternarAbertura(a, "meta-1");
    expect([...a]).toEqual(["meta-2"]);
    expect(contextoDaAbertura("todas", "campaign", 7)).not.toBe(contextoDaAbertura("todas", "adset", 7));
    expect(contextoDaAbertura("todas", "campaign", 7)).not.toBe(contextoDaAbertura("meta", "campaign", 7));
    expect(contextoDaAbertura("todas", "campaign", 7)).not.toBe(contextoDaAbertura("todas", "campaign", 28));
  });
  it("a série só é pedida com uma linha da META aberta — sem expansão, ou só Google aberto, nada", () => {
    const linhas = [{ platform: "meta" as const, id: "1" }, { platform: "google" as const, id: "g" }];
    expect(precisaDaSerieDaMeta(new Set(), linhas)).toBe(false);
    expect(precisaDaSerieDaMeta(new Set([chaveDaLinha(linhas[1])]), linhas)).toBe(false);
    expect(precisaDaSerieDaMeta(new Set([chaveDaLinha(linhas[0])]), linhas)).toBe(true);
    // a chave aberta de outra dimensão não conta (a linha não existe mais)
    expect(precisaDaSerieDaMeta(new Set(["meta-outra"]), linhas)).toBe(false);
  });
});

describe("AC2f (PO-01) — o casamento: id na campanha, NOME aparado no público e no criativo", () => {
  it("campanha pelo id: a linha c1 não leva os dias de c2 de mesmo nome", () => {
    const idx = indiceDaMidiaDaMeta("campaign", [
      serie({ entityId: "c1", entityName: "Frio", spend: 10 }),
      serie({ entityId: "c2", entityName: "Frio", spend: 99 }),
    ]);
    expect(idx.get("c1")?.get(HOJE)?.spendBruto).toBe(10);
    expect(idx.has("Frio")).toBe(false);
  });
  it("DOIS conjuntos de mesmo nome (ids diferentes, um com espaço) somam na linha do nome — e a Σ fecha com a linha", () => {
    // `/all-adsets` agrega por adset_name.trim(): a linha "Conjunto A" é a soma dos dois ids
    const rows = [
      serie({ entityId: "as-1", entityName: "Conjunto A", dateStart: "2026-10-27", spend: 40, impressions: 1000, clicks: 30, linkClicks: 20 }),
      serie({ entityId: "as-2", entityName: " Conjunto A  ", dateStart: "2026-10-27", spend: 60, impressions: 500, clicks: 15, linkClicks: 10 }),
      serie({ entityId: "as-2", entityName: " Conjunto A  ", dateStart: HOJE, spend: 12.5, impressions: 100, clicks: 2, linkClicks: 1 }),
      serie({ entityId: "as-3", entityName: "Conjunto B", dateStart: HOJE, spend: 7, impressions: 70, clicks: 7, linkClicks: 7 }),
    ];
    const idx = indiceDaMidiaDaMeta("adset", rows);
    expect(idx.get("Conjunto A")?.get("2026-10-27")).toEqual({ spendBruto: 100, impressions: 1500, clicks: 45, linkClicks: 30, centavos: 10000 });
    const linha = linhaMeta("as-1", "Conjunto A", 112.5, 1600, 31);
    const e = expansaoDaMeta({ linha, dias: diasDaJanela(2, HOJE), hoje: HOJE, dimensao: "adset", serie: idx, semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias.map((d) => d.midia?.impressions)).toEqual([100, 1500]);
    expect(e.soma.midia.impressions).toBe(1600);
    expect(e.soma.midia.clicks).toBe(31);
    expect(e.soma.diferenca).toBeNull();
    // casando pelo id da linha (as-1), a expansão seria menor que a linha
    expect(idx.has("as-1")).toBe(false);
  });
  it("criativo também pelo nome; o nome vazio no cache (o id no lugar) não casa e é declarado fora das expansões", () => {
    const rows = [
      serie({ entityId: "ad-1", entityName: "ads-roteiro-07", spend: 10 }),
      serie({ entityId: "ad-2", entityName: "ads-roteiro-07 ", spend: 5 }),
      serie({ entityId: "ad-9", entityName: "ad-9", spend: 8.785 }), // sem nome: o serviço devolve o id
    ];
    const idx = indiceDaMidiaDaMeta("ad", rows);
    expect(idx.get("ads-roteiro-07")?.get(HOJE)?.spendBruto).toBe(15);
    const linhas = [{ id: "ad-1", name: "ads-roteiro-07", platform: "meta" }];
    const fora = midiaSemLinha("ad", idx, linhas)!;
    expect(fora.entidades).toBe(1);
    expect(fora.spend).toBeCloseTo(comImpostoMeta(8.79, HOJE), 10);
    expect(midiaSemLinha("ad", indiceDaMidiaDaMeta("ad", rows.slice(0, 2)), linhas)).toBeNull();
  });
});

describe("AC2b (PO-02) — o gross-up dos dias: uma vez, por dia, na mesma base da linha", () => {
  it("o dia tributado = bruto ÷ (1 − 0,1215); a Σ dos dias tributados = a linha tributada pelo backend", () => {
    const idx = indiceDaMidiaDaMeta("campaign", [
      serie({ entityId: "c1", dateStart: "2026-10-27", spend: 87.85, impressions: 1000, linkClicks: 10, clicks: 12 }),
      serie({ entityId: "c1", dateStart: HOJE, spend: 12.15, impressions: 200, linkClicks: 2, clicks: 3 }),
    ]);
    const linha = linhaMeta("c1", "Campanha", 100, 1200, 12);
    const e = expansaoDaMeta({ linha, dias: diasDaJanela(2, HOJE), hoje: HOJE, dimensao: "campaign", serie: idx, semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias[1]!.midia!.spend).toBeCloseTo(87.85 / (1 - 0.1215), 10);
    expect(e.dias[0]!.midia!.spend).toBeCloseTo(12.15 / (1 - 0.1215), 10);
    expect(e.soma.midia.spend).toBeCloseTo(linha.spend, 10);
    expect(e.soma.diferenca).toBeNull();
    // CPM e CPC do dia pela regra da linha (metaRow), sobre o tributado
    expect(e.dias[1]!.midia!.cpm).toBeCloseTo((87.85 / (1 - 0.1215) / 1000) * 1000, 10);
    expect(e.dias[1]!.midia!.cpc).toBeCloseTo(87.85 / (1 - 0.1215) / 10, 10);
  });
  it("o Google não leva imposto", () => {
    const linha = googleRow({ id: "g1", name: "Search", status: null, spend: 30, impressions: 300, clicks: 3 });
    const e = expansaoDoGoogle({ linha, dias: diasDaJanela(2, HOJE), hoje: HOJE, linhasDoDaily: [{ date: HOJE, spend: 10, impressions: 100, clicks: 1 }, { date: "2026-10-27", spend: 20, impressions: 200, clicks: 2 }] });
    expect(e.dias.map((d) => d.midia!.spend)).toEqual([10, 20]);
    expect(e.soma.midia.spend).toBe(30);
    expect(e.soma.diferenca).toBeNull();
  });
});

describe("AC2c / AC2d — cliques de link e Hook/Hold", () => {
  it("dia sem link_click → Cliques, CTR e CPC “—” (null), como a linha; Hook/Hold sempre null nos dias", () => {
    const idx = indiceDaMidiaDaMeta("ad", [serie({ entityId: "a", entityName: "A", spend: 10, impressions: 100, clicks: 9, linkClicks: 0 })]);
    const linha = { ...linhaMeta("a", "A", 10, 100, 0), hookRate: 30, holdRate: 20 };
    const e = expansaoDaMeta({ linha, dias: [HOJE], hoje: HOJE, dimensao: "ad", serie: idx, semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias[0]!.midia).toMatchObject({ clicks: null, ctr: null, cpc: null, hookRate: null, holdRate: null });
    expect(e.soma.midia).toMatchObject({ clicks: null, hookRate: null, holdRate: null });
  });
});

describe("AC4d — dia sem cobertura do cache é “—”, não 0; dia sem dado é 0", () => {
  it("daysWithoutCoverage → midia null com a dica; o dia sem linha nenhuma → zerado", () => {
    const idx = indiceDaMidiaDaMeta("adset", [serie({ entityName: "A", dateStart: HOJE, spend: 5, impressions: 50, linkClicks: 5 })]);
    const linha = linhaMeta("x", "A", 5, 50, 5);
    const e = expansaoDaMeta({ linha, dias: diasDaJanela(3, HOJE), hoje: HOJE, dimensao: "adset", serie: idx, semCobertura: new Set(["2026-10-27"]), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias[1]).toMatchObject({ dia: "2026-10-27", midia: null, investimentoExibido: null, dicaDaMidia: DICA_SEM_COBERTURA_DO_DIA });
    expect(e.dias[2]!.midia).toMatchObject({ spend: 0, impressions: 0, clicks: null });
    expect(e.dias[2]!.investimentoExibido).toBe(0);
    expect(e.dias[2]!.dicaDaMidia).toBeNull();
  });
});

describe("AC4 — a Σ dos dias", () => {
  it("(c) diferente da linha → a diferença aparece, com a dica; nenhum dia é ajustado", () => {
    const idx = indiceDaMidiaDaMeta("adset", [serie({ entityName: "A", spend: 87.85, impressions: 1000, linkClicks: 10 })]);
    // a linha ao vivo tem mais 10 de bruto, 5 impressões e 1 clique que o cache
    const linha = linhaMeta("x", "A", 97.85, 1005, 11);
    const e = expansaoDaMeta({ linha, dias: [HOJE], hoje: HOJE, dimensao: "adset", serie: idx, semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    expect(e.dias[0]!.midia!.spend).toBeCloseTo(100, 10); // o dia fica com o que o cache diz
    expect(e.soma.diferenca).toEqual({ spend: -11.38, impressions: -5, clicks: -1 });
    expect(e.soma.dicaDaDiferenca).toBe(DICA_DIFERENCA_DA_MIDIA);
  });
  it("(c) tolerância: 1 centavo não aparece; 2 centavos aparecem; 1 impressão aparece", () => {
    const base = { spend: 10, impressions: 100, clicks: 5 };
    expect(diferencaDaMidia(base, { ...base, spend: 10.01 })).toBeNull();
    expect(diferencaDaMidia(base, { ...base, spend: 10.02 })).toEqual({ spend: -0.02, impressions: 0, clicks: 0 });
    expect(diferencaDaMidia(base, { ...base, impressions: 101 })).toEqual({ spend: 0, impressions: -1, clicks: 0 });
    expect(diferencaDaMidia({ ...base, clicks: null }, { ...base, clicks: null })).toBeNull();
  });
  it("(e) fecharEmCentavos: a coluna dos dias EXIBIDA soma a Σ exibida, ao centavo", () => {
    // três dias de R$ 0,88 bruto = R$ 1,0017 tributado: um a um dariam 3,00; a soma é 3,01
    const bruto = 0.88;
    const idx = indiceDaMidiaDaMeta("campaign", diasDaJanela(3, HOJE).map((d) => serie({ entityId: "c", dateStart: d, spend: bruto, impressions: 10, linkClicks: 1 })));
    const e = expansaoDaMeta({ linha: linhaMeta("c", "C", 3 * bruto, 30, 3), dias: diasDaJanela(3, HOJE), hoje: HOJE, dimensao: "campaign", serie: idx, semCobertura: new Set(), vendas: { tipo: "indisponivel", dica: null }, chaveDaVenda: undefined, brlRate: 5 });
    const exibidos = e.dias.map((d) => d.investimentoExibido!);
    const somaExibida = Math.round(exibidos.reduce((a, b) => a + b, 0) * 100);
    expect(somaExibida).toBe(Math.round(e.soma.investimentoExibido * 100));
    expect(somaExibida).toBe(301);
    // e é diferente da soma dos arredondamentos independentes (é o caso que a regra existe para fechar)
    const independentes = e.dias.map((d) => Math.round(d.midia!.spend * 100)).reduce((a, b) => a + b, 0);
    expect(independentes).not.toBe(somaExibida);
  });
  it("(b) venda: a Σ é a soma de TODOS os dias da chave (= a linha, AC3b); a receita exibida fecha em centavos", () => {
    const estado = pronto({
      metaPorEntidadeDiario: {
        campaign: [
          // US$ 1,00 × 5,004 = R$ 5,004 por dia: um a um dariam 15,00; a soma é 15,01
          { chave: "c1", dia: HOJE, vendas: 1, compradores: 1, receitaUsd: 1 },
          { chave: "c1", dia: "2026-10-27", vendas: 2, compradores: 1, receitaUsd: 1 },
          { chave: "c1", dia: "2026-10-26", vendas: 1, compradores: 1, receitaUsd: 1 },
          { chave: "c2", dia: HOJE, vendas: 9, compradores: 9, receitaUsd: 99 },
        ],
        adset: [],
        ad: [],
      },
    });
    const vendas = vendasDosDias(estado, "campaign");
    const e = expansaoDaMeta({ linha: linhaMeta("c1", "C", 0, 0, 0), dias: diasDaJanela(3, HOJE), hoje: HOJE, dimensao: "campaign", serie: new Map(), semCobertura: new Set(), vendas, chaveDaVenda: "c1", brlRate: 5.004 });
    expect(e.dias.map((d) => d.venda?.vendas)).toEqual([1, 2, 1]);
    expect(e.soma.venda).toEqual({ vendas: 4, compradores: 3, receitaUsd: 3 });
    expect(e.soma.receitaBrlExibida).toBe(15.01);
    const somaExibida = Math.round(e.dias.reduce((a, d) => a + d.receitaBrlExibida!, 0) * 100);
    expect(somaExibida).toBe(1501);
    expect(e.dias[0]!.dicaDaVenda).toBe(DICA_ATRIBUICAO_DO_DIA);
  });
});

describe("AC3e / AC5c / AC5d — os estados da venda dos dias", () => {
  const linha = linhaMeta("c1", "C", 0, 0, 0);
  const rodar = (estado: EstadoDasVendas, opcoes: { semDono?: boolean } = {}) =>
    expansaoDaMeta({ linha, dias: diasDaJanela(3, "2026-10-07"), hoje: "2026-10-07", dimensao: "campaign", serie: new Map(), semCobertura: new Set(), vendas: vendasDosDias(estado, "campaign"), chaveDaVenda: opcoes.semDono ? undefined : "c1", brlRate: 5 });
  it("antes de atributosDesde → “—” com a declaração de cobertura; a partir dele, número (0 sem venda)", () => {
    const e = rodar(pronto({ desde: "2026-10-05", metaPorEntidadeDiario: { campaign: [{ chave: "c1", dia: "2026-10-07", vendas: 1, compradores: 1, receitaUsd: 2 }], adset: [], ad: [] } }));
    expect(e.dias.map((d) => [d.dia, d.venda?.vendas ?? null])).toEqual([["2026-10-07", 1], ["2026-10-06", 0], ["2026-10-05", null]]);
    expect(e.dias[2]!.dicaDaVenda).toMatch(/só chega desde 06\/10\/2026/);
  });
  it("a venda de um dia exibido como “—” entra na Σ (a linha), e a Σ declara", () => {
    const e = rodar(pronto({ desde: "2026-10-05", metaPorEntidadeDiario: { campaign: [{ chave: "c1", dia: "2026-10-05", vendas: 2, compradores: 1, receitaUsd: 4 }], adset: [], ad: [] } }));
    expect(e.dias[2]!.venda).toBeNull();
    expect(e.soma.venda).toMatchObject({ vendas: 2, receitaUsd: 4 });
    expect(e.soma.dicaDaVenda).toMatch(/Inclui 2 vendas de dias que aparecem como “—” \(antes de 06\/10\/2026\)/);
  });
  it("API anterior à v62 (sem metaPorEntidadeDiario) → “—” com a dica de versão", () => {
    const e = rodar(pronto({ metaPorEntidadeDiario: undefined }));
    expect(e.dias.every((d) => d.venda === null && d.dicaDaVenda === DICA_API_SEM_VENDA_POR_DIA)).toBe(true);
    expect(e.soma.venda).toBeNull();
  });
  it("venda carregando ou em erro → “—” nos dias", () => {
    for (const estado of [{ tipo: "carregando" }, { tipo: "erro", mensagem: "x" }, { tipo: "oculto" }] as EstadoDasVendas[]) {
      const e = rodar(estado);
      expect(e.dias.every((d) => d.venda === null)).toBe(true);
      expect(e.soma.venda).toBeNull();
    }
  });
  it("linha que não é dona da chave (a mesma chave em duas linhas) → 0, como a linha", () => {
    const e = rodar(pronto({ metaPorEntidadeDiario: { campaign: [{ chave: "c1", dia: "2026-10-07", vendas: 1, compradores: 1, receitaUsd: 2 }], adset: [], ad: [] } }), { semDono: true });
    expect(e.dias[0]!.venda).toEqual({ vendas: 0, compradores: 0, receitaUsd: 0 });
  });
  it("donosDasChaves: a primeira linha que casa leva a chave (a regra de vendasDoDetalhamento)", () => {
    const d = donosDasChaves("adset", [
      { id: "1", name: "A", platform: "meta" },
      { id: "2", name: " A ", platform: "meta" },
      { id: "g", name: "A", platform: "google" },
    ]);
    expect([...d]).toEqual([["meta-1", "A"]]);
  });
  it("Google (D22) → “—” com a dica; nunca número", () => {
    const g = googleRow({ id: "g1", name: "Search", status: null, spend: 0, impressions: 0, clicks: 0 });
    const e = expansaoDoGoogle({ linha: g, dias: diasDaJanela(2, HOJE), hoje: HOJE, linhasDoDaily: [] });
    expect(e.dias.every((d) => d.venda === null && d.dicaDaVenda === DICA_GOOGLE_SEM_VENDA)).toBe(true);
    expect(e.dias.map((d) => d.midia!.spend)).toEqual([0, 0]); // todo dia aparece, zerado
    expect(e.soma.dicaDaVenda).toBe(DICA_GOOGLE_SEM_VENDA);
  });
});
