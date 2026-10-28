import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { sumMetaSpendWithTax } from "../funnel-metrics";
import { cardsDoResumo, type EntradaDoResumo } from "../resumo-mobile-lyrio";
import { hojeNoNegocio } from "../janela-dos-cards-lyrio";
import { investimentoDoGoogleNaRegua, trafegoDoGoogleNaRegua, type ConsultaDiariaDoGoogle } from "../google-ads-na-regua";
import type { ContaDoGoogle } from "../lyrio-google-ads";
import type { EstadoDasVendas, VendasPorCanalDoLyrio } from "../vendas-por-canal-lyrio";
import {
  CAUSA_API_SEM_DIARIO,
  DICA_ANTES_DA_SERIE,
  fecharNoMaiorDia,
  formatarCelula,
  montarDadosDiariosDoLyrio,
  type ChaveDaColuna,
  type DadosDiariosDoLyrio,
  type EntradaDosDadosDiarios,
} from "../dados-diarios-lyrio";

/**
 * Story 42.17 — a tabela "Dados diários" do Lyrio (AC1, AC2, AC4, AC5, AC7a,
 * AC7b, AC7d). O fixture foi escolhido para que arredondar dia a dia DIVIRJA do
 * Total em 1 centavo, na Meta (72,22 × 72,23) e na Receita (15,00 × 15,01).
 */

const HOJE = "2026-10-28";
const DIAS = 7; // 22/10 a 28/10

const meta = (date: string, spend: string, impressions: number, linkClicks: number): CampaignDailyInsight => ({
  date_start: date,
  date_stop: date,
  impressions: String(impressions),
  reach: "0",
  clicks: String(linkClicks * 2),
  spend,
  ctr: "0",
  cpc: "0",
  cpm: "0",
  actions: [{ action_type: "link_click", value: String(linkClicks) }],
});
const LINHAS_META = [meta("2026-10-22", "10.01", 1000, 10), meta("2026-10-24", "33.33", 3000, 30), meta("2026-10-26", "7.77", 500, 5), meta("2026-10-27", "12.34", 1500, 15)];

const CONTA: ContaDoGoogle = { tipo: "conta", accountId: "acc" };
const CONSULTAS_GOOGLE: ConsultaDiariaDoGoogle[] = [
  {
    campaignId: "g1",
    isLoading: false,
    error: null,
    // 21/10 está fora da régua de 7 dias: não entra no card nem na tabela
    data: [{ date: "2026-10-21", spend: 99, impressions: 9999, clicks: 99 }, { date: "2026-10-22", spend: 5.5, impressions: 200, clicks: 4 }, { date: "2026-10-28", spend: 1.25, impressions: 100, clicks: 1 }],
  },
  { campaignId: "g2", isLoading: false, error: null, data: [{ date: "2026-10-24", spend: 2.25, impressions: 50, clicks: 2 }] },
];

const VENDAS: VendasPorCanalDoLyrio = {
  days: DIAS,
  desde: "2026-10-22",
  atributosDesde: "2026-10-06",
  canais: [
    { canal: "meta", rotulo: "Meta", vendas: 2, compradores: 2, receitaUsd: 2 },
    { canal: "google", rotulo: "Google", vendas: 1, compradores: 1, receitaUsd: 0.5 },
    { canal: "organico", rotulo: "Orgânico ou cupom", vendas: 1, compradores: 1, receitaUsd: 0.5 },
    { canal: "sem_atribuicao", rotulo: "Sem atribuição", vendas: 0, compradores: 0, receitaUsd: 0 },
  ],
  conflito: { vendas: 0, compradores: 0, receitaUsd: 0 },
  totalPago: { vendas: 4, compradores: 4, receitaUsd: 3 },
  metaPorEntidade: { campaign: [], adset: [], ad: [] },
  diario: [
    { dia: "2026-10-23", vendas: 1, receitaUsd: 1 },
    { dia: "2026-10-25", vendas: 2, receitaUsd: 1 },
    { dia: "2026-10-27", vendas: 1, receitaUsd: 1 },
  ],
  foraDaQuebra: { semValor: 0, semUsuario: 0 },
};
const TAXA = 5.0042;

function entrada(p: Partial<EntradaDosDadosDiarios> = {}): EntradaDosDadosDiarios {
  return {
    ctx: { diasDoFiltro: DIAS, hoje: HOJE, serieDesde: "2026-08-10" },
    cambio: { taxa: TAXA, fonte: "/api/fx/usd-brl · manual" },
    meta: { temCampanhas: true, linhas: LINHAS_META, erro: null },
    google: { mostrar: true, trafego: trafegoDoGoogleNaRegua(CONTA, CONSULTAS_GOOGLE, DIAS, HOJE) },
    vendas: { tipo: "pronto", dados: VENDAS },
    revenuecatConectado: true,
    ...p,
  };
}

/** Os MESMOS insumos, no formato do Resumo (42.15). */
function entradaDoResumo(e: EntradaDosDadosDiarios, consultas = CONSULTAS_GOOGLE): EntradaDoResumo {
  return {
    ctx: e.ctx,
    cambio: e.cambio,
    meta: { temCampanhas: e.meta.temCampanhas, filtro: e.meta.linhas ? sumMetaSpendWithTax([[...e.meta.linhas]]) : undefined, erroFiltro: e.meta.erro },
    google: { mostrar: e.google.mostrar, filtro: investimentoDoGoogleNaRegua(e.google.mostrar ? CONTA : { tipo: "sem_campanha" }, consultas, e.ctx.diasDoFiltro, e.ctx.hoje) },
    vendas: e.vendas,
    novosClientes: { tipo: "oculto" },
    overview: { tipo: "oculto" },
    percentuais: { tipo: "carregando" },
  };
}

const dia = (d: DadosDiariosDoLyrio, date: string) => d.dias.find((x) => x.date === date)!;
const texto = (d: DadosDiariosDoLyrio, chave: ChaveDaColuna, v: number | null) => formatarCelula(d.colunas.find((c) => c.chave === chave)!.formato, v);
const somaEmCentavos = (d: DadosDiariosDoLyrio, chave: ChaveDaColuna) => d.dias.reduce((s, x) => s + Math.round((x.valores[chave] ?? 0) * 100), 0);

describe("AC1 — a janela: um dia de SP por linha, de inicioDaJanela(days) até hoje", () => {
  it("(b) 7 linhas, de 28/10 a 22/10 (mais recente primeiro), inclusive os dias sem nada (0, e as razões “—”)", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    expect(d.dias.map((x) => x.date)).toEqual(["2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23", "2026-10-22"]);
    // 25/10: só venda; nenhuma mídia → investimento 0; CTR/CPM/CPC/ROAS "—" (denominador 0)
    const vazio = dia(d, "2026-10-25");
    expect(vazio.valores).toMatchObject({ investimento: 0, investMeta: 0, investGoogle: 0, impressoes: 0, cliques: 0, vendas: 2, ctr: null, cpm: null, cpc: null, roas: null });
    expect(vazio.causas).toEqual({});
    // 26/10: só Meta, nenhuma venda → Vendas e Receita 0 (não "—": a fonte respondeu)
    expect(dia(d, "2026-10-26").valores).toMatchObject({ vendas: 0, receita: 0, custoPorVenda: null });
    expect(dia(d, "2026-10-26").causas).toEqual({});
    // 23/10 só venda, sem mídia: o Custo por venda é 0 ÷ 1 = R$ 0,00
    expect(texto(d, "custoPorVenda", dia(d, "2026-10-23").valores.custoPorVenda)).toBe("R$ 0,00");
  });
  it("(b) a ordem inverte pelo cabeçalho (asc)", () => {
    expect(montarDadosDiariosDoLyrio(entrada({ ordem: "asc" })).dias.map((x) => x.date)[0]).toBe("2026-10-22");
  });
  it("(b) segue o filtro de dias: 1, 28 e 90 linhas", () => {
    for (const n of [1, 28, 90]) {
      const d = montarDadosDiariosDoLyrio(entrada({ ctx: { diasDoFiltro: n, hoje: HOJE }, meta: { temCampanhas: false, linhas: undefined }, google: { mostrar: false, trafego: { tipo: "sem_campanha" } }, vendas: { tipo: "oculto" } }));
      expect(d.dias).toHaveLength(n);
      expect(d.dias.at(-1)!.date).toBe(n === 1 ? HOJE : n === 28 ? "2026-10-01" : "2026-07-31");
    }
  });
  it("(c) o título declara a janela: `Dados diários · últimos 7 dias (22/10 a 28/10)`", () => {
    expect(montarDadosDiariosDoLyrio(entrada()).titulo).toBe("Dados diários · últimos 7 dias (22/10 a 28/10)");
    expect(montarDadosDiariosDoLyrio(entrada({ ctx: { diasDoFiltro: 1, hoje: HOJE }, vendas: { tipo: "oculto" } })).titulo).toBe("Dados diários · último dia (28/10 a 28/10)");
  });
  it("(d) só hoje leva a marca de dia em andamento", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    expect(d.dias.filter((x) => x.emAndamento).map((x) => x.date)).toEqual([HOJE]);
  });
  it("(e) os dias antes de serieDesde mostram “—” (não 0) nas colunas do RevenueCat, com a dica; a mídia continua", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ ctx: { diasDoFiltro: DIAS, hoje: HOJE, serieDesde: "2026-10-23" } }));
    const antes = dia(d, "2026-10-22");
    expect(antes.antesDaSerie).toBe(true);
    expect(antes.valores).toMatchObject({ vendas: null, receita: null, roas: null, custoPorVenda: null });
    expect(antes.valores.investimento).not.toBeNull();
    for (const k of ["vendas", "receita", "roas", "custoPorVenda"] as const) expect(antes.causas[k]).toBe(DICA_ANTES_DA_SERIE);
    expect(dia(d, "2026-10-23").antesDaSerie).toBe(false);
    expect(dia(d, "2026-10-23").valores.vendas).toBe(1);
  });
  it("(e) dia antes de serieDesde que TEM venda mostra a venda: a coluna continua somando o Total (AC4c)", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ ctx: { diasDoFiltro: DIAS, hoje: HOJE, serieDesde: "2026-10-26" } }));
    expect(dia(d, "2026-10-25").valores.vendas).toBe(2);
    expect(dia(d, "2026-10-24").valores.vendas).toBeNull();
    expect(d.dias.reduce((s, x) => s + (x.valores.vendas ?? 0), 0)).toBe(d.total.valores.vendas);
  });
});

describe("AC4 — o Total fecha com o Resumo, ao centavo, e a coluna soma o Total", () => {
  it("(a/b) Investimento, Invest. Meta, Invest. Google, Vendas e Receita do rodapé = os cards do Resumo, com os mesmos insumos", () => {
    const e = entrada();
    const d = montarDadosDiariosDoLyrio(e);
    const cards = cardsDoResumo(entradaDoResumo(e));
    const card = (id: string) => cards.find((c) => c.id === id)!;
    const t = d.total.valores;
    expect(texto(d, "investimento", t.investimento)).toBe(card("investimento").valor);
    expect(texto(d, "investimento", t.investimento)).toBe("R$ 81,23");
    expect(texto(d, "investMeta", t.investMeta)).toBe(card("investimento").secundarias!.find((l) => l.id === "meta")!.valor);
    expect(texto(d, "investGoogle", t.investGoogle)).toBe(card("investimento").secundarias!.find((l) => l.id === "google")!.valor);
    expect(texto(d, "vendas", t.vendas)).toBe(card("vendas").valor);
    expect(texto(d, "receita", t.receita)).toBe(card("receita").valor);
    expect(texto(d, "receita", t.receita)).toBe("R$ 15,01");
    // o ROAS do rodapé também é o do card (receita total ÷ investimento total)
    expect(texto(d, "roas", t.roas)).toBe(card("roas").valor);
  });
  it("(c) a coluna de cada valor em R$ soma EXATAMENTE o Total exibido — e arredondar dia a dia daria 1 centavo a menos", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    const t = d.total.valores;
    for (const k of ["investimento", "investMeta", "investGoogle", "receita"] as const) {
      expect(somaEmCentavos(d, k), k).toBe(Math.round(t[k]! * 100));
    }
    // o caso que quebra: a Meta do dia arredondada sozinha (11,39 + 37,94 + 8,84 + 14,05 = 72,22) × 72,23
    const metaDiaADia = LINHAS_META.map((l) => Math.round((Number(l.spend) / (1 - 0.1215)) * 100)).reduce((s, x) => s + x, 0);
    expect(metaDiaADia).toBe(7222);
    expect(Math.round(t.investMeta! * 100)).toBe(7223);
    // e a Receita: 3 × 5,0042 = 5,00 + 5,00 + 5,00 = 15,00 × 15,01
    expect(3 * Math.round(TAXA * 100)).toBe(1500);
    expect(Math.round(t.receita! * 100)).toBe(1501);
  });
  it("(c) o resto do centavo vai para o MAIOR dia, nunca para um dia sem nada (hoje, 28/10, não tem Meta)", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    expect(dia(d, HOJE).valores.investMeta).toBe(0);
    expect(dia(d, "2026-10-24").valores.investMeta).toBe(37.95); // 37,93967 → 37,94, +1 centavo do resto
    expect(dia(d, "2026-10-28").valores.receita).toBe(0);
  });
  it("(c) o Investimento do dia é a Meta do dia + o Google do dia (fechados)", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    for (const x of d.dias) expect(Math.round(x.valores.investimento! * 100)).toBe(Math.round(x.valores.investMeta! * 100) + Math.round(x.valores.investGoogle! * 100));
    expect(dia(d, "2026-10-22").valores).toMatchObject({ investMeta: 11.39, investGoogle: 5.5, investimento: 16.89 });
  });
  it("o imposto da Meta é aplicado UMA vez (10,01 ÷ 0,8785 = 11,39; duas vezes daria 12,97)", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    expect(dia(d, "2026-10-22").valores.investMeta).toBe(11.39);
    expect(d.total.valores.investMeta).toBeCloseTo(72.2253, 3);
  });
  it("(AC2b) as razões do rodapé saem das somas, não da média das razões dos dias", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    const t = d.total.valores;
    expect(t.impressoes).toBe(1000 + 3000 + 500 + 1500 + 200 + 100 + 50);
    expect(t.cliques).toBe(10 + 30 + 5 + 15 + 4 + 1 + 2);
    expect(t.ctr).toBeCloseTo((t.cliques! * 100) / t.impressoes!, 10);
    expect(t.cpm).toBeCloseTo((t.investimento! * 1000) / t.impressoes!, 10);
    expect(t.cpc).toBeCloseTo(t.investimento! / t.cliques!, 10);
    expect(t.custoPorVenda).toBeCloseTo(t.investimento! / 4, 10);
    expect(t.roas).toBeCloseTo((3 * TAXA) / t.investimento!, 10);
    const ctrs = d.dias.map((x) => x.valores.ctr).filter((x): x is number => x != null);
    expect(t.ctr).not.toBeCloseTo(ctrs.reduce((s, x) => s + x, 0) / ctrs.length, 2);
  });
  it("(AC2) Impressões e Cliques: Meta (link click) + Google, por dia", () => {
    const d = montarDadosDiariosDoLyrio(entrada());
    expect(dia(d, "2026-10-24").valores).toMatchObject({ impressoes: 3050, cliques: 32 });
    expect(dia(d, "2026-10-28").valores).toMatchObject({ impressoes: 100, cliques: 1, investimento: 1.25 });
  });
});

describe("AC1b/AC7a — o dia de SP, não o de UTC, com relógio e TZ fixos", () => {
  describe.each(["UTC", "America/Sao_Paulo"])("TZ=%s", (tz) => {
    let anterior: string | undefined;
    beforeAll(() => {
      anterior = process.env.TZ;
      process.env.TZ = tz;
    });
    afterAll(() => {
      if (anterior === undefined) delete process.env.TZ;
      else process.env.TZ = anterior;
    });
    afterEach(() => vi.useRealTimers());

    it("01:30Z de 29/10 ainda é 28/10 em SP: a última linha é 28/10, a primeira 22/10, e o dia 29/10 do Google (UTC) não entra", () => {
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === "UTC" ? 0 : 180);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-29T01:30:00Z"));
      const hoje = hojeNoNegocio();
      expect(hoje).toBe("2026-10-28");
      const consultas: ConsultaDiariaDoGoogle[] = [...CONSULTAS_GOOGLE, { campaignId: "g3", isLoading: false, error: null, data: [{ date: "2026-10-29", spend: 50, impressions: 10, clicks: 1 }] }];
      const e = entrada({ ctx: { diasDoFiltro: DIAS, hoje }, google: { mostrar: true, trafego: trafegoDoGoogleNaRegua(CONTA, consultas, DIAS, hoje) } });
      const d = montarDadosDiariosDoLyrio(e);
      expect(d.dias[0]).toMatchObject({ date: "2026-10-28", emAndamento: true });
      expect(d.dias.at(-1)!.date).toBe("2026-10-22");
      expect(d.total.valores.investGoogle).toBe(9);
      expect(texto(d, "investimento", d.total.valores.investimento)).toBe(cardsDoResumo(entradaDoResumo(e, consultas)).find((c) => c.id === "investimento")!.valor);
    });
  });
});

describe("AC5 — estados: insumo desconhecido é “—” com a causa, nunca um número parcial", () => {
  it("(a) Meta em erro: “—” no Invest. Meta, Investimento, ROAS, Custo por venda, CPM, CPC (e impressões, cliques, CTR) de todos os dias, com aviso", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ meta: { temCampanhas: true, linhas: undefined, erro: "Request failed 502" } }));
    expect(d.carregando).toBe(false);
    for (const x of [...d.dias, d.total]) {
      for (const k of ["investMeta", "investimento", "roas", "custoPorVenda", "cpm", "cpc", "impressoes", "cliques", "ctr"] as const) {
        expect(x.valores[k], k).toBeNull();
        expect(x.causas[k], k).toMatch(/Request failed 502/);
      }
    }
    expect(d.dias.every((x) => x.valores.investGoogle != null)).toBe(true);
    expect(d.total.valores.vendas).toBe(4);
    expect(d.avisos.join(" ")).toMatch(/Não foi possível carregar o investimento da Meta: Request failed 502/);
  });
  it("(a) Google em erro e Google sem conta: “—” no Invest. Google e nos dependentes, com o aviso do Google", () => {
    for (const trafego of [{ tipo: "erro" as const, mensagem: "invalid_grant" }, { tipo: "sem_conta" as const }]) {
      const d = montarDadosDiariosDoLyrio(entrada({ google: { mostrar: true, trafego } }));
      for (const x of [...d.dias, d.total]) {
        for (const k of ["investGoogle", "investimento", "roas", "custoPorVenda", "cpm", "cpc", "impressoes", "cliques", "ctr"] as const) {
          expect(x.valores[k], `${trafego.tipo} ${k}`).toBeNull();
          expect(x.causas[k], `${trafego.tipo} ${k}`).toBeTruthy();
        }
        expect(x.valores.investMeta).not.toBeNull();
      }
      expect(d.avisos.join(" ")).toMatch(trafego.tipo === "erro" ? /Não foi possível buscar os dados do Google Ads\. invalid_grant/ : /Nenhuma conta Google Ads conectada/);
    }
  });
  it("(b) sem campanha Google vinculada: a coluna Invest. Google some e o Investimento é só a Meta", () => {
    const e = entrada({ google: { mostrar: false, trafego: { tipo: "sem_campanha" } } });
    const d = montarDadosDiariosDoLyrio(e);
    expect(d.colunas.map((c) => c.chave)).not.toContain("investGoogle");
    expect(d.colunas.find((c) => c.chave === "investimento")!.dica).toMatch(/sem campanha Google/);
    expect(dia(d, "2026-10-22").valores).toMatchObject({ investimento: 11.39, impressoes: 1000, cliques: 10 });
    expect(texto(d, "investimento", d.total.valores.investimento)).toBe(cardsDoResumo(entradaDoResumo(e)).find((c) => c.id === "investimento")!.valor);
    expect(d.avisos).toEqual([]);
  });
  it("(b) sem campanha Meta vinculada: a Meta é R$ 0 (como no Resumo), não “—”", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ meta: { temCampanhas: false, linhas: undefined } }));
    expect(d.carregando).toBe(false);
    expect(d.total.valores).toMatchObject({ investMeta: 0, investimento: 9 });
  });
  it("(c) RevenueCat desconectado, rota em erro, rota antiga sem `diario` e API sem a rota: “—” nas colunas de venda, com o aviso", () => {
    const casos: [EstadoDasVendas, boolean, RegExp][] = [
      [{ tipo: "oculto" }, false, /RevenueCat não conectado/],
      [{ tipo: "oculto" }, true, /API ainda não tem a rota das vendas por canal/],
      [{ tipo: "erro", mensagem: "Erro interno do servidor" }, true, /Não foi possível carregar as vendas por canal: Erro interno do servidor/],
      [{ tipo: "pronto", dados: { ...VENDAS, diario: undefined } }, true, /contrato 64\) — ver o aviso de versão/],
    ];
    for (const [vendas, conectado, aviso] of casos) {
      const d = montarDadosDiariosDoLyrio(entrada({ vendas, revenuecatConectado: conectado }));
      for (const x of [...d.dias, d.total]) {
        for (const k of ["vendas", "receita", "roas", "custoPorVenda"] as const) {
          expect(x.valores[k], k).toBeNull();
          expect(x.causas[k], k).toBeTruthy();
        }
        expect(x.valores.investimento).not.toBeNull();
      }
      expect(d.avisos.join(" ")).toMatch(aviso);
    }
    const semDiario = montarDadosDiariosDoLyrio(entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, diario: undefined } } }));
    expect(semDiario.total.causas.vendas).toBe(CAUSA_API_SEM_DIARIO);
  });
  it("(a, AC2a) sem câmbio: Receita e ROAS “—” com a causa; as Vendas continuam", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ cambio: { taxa: null, fonte: "/api/fx/usd-brl · fallback" } }));
    expect(d.total.valores).toMatchObject({ receita: null, roas: null, vendas: 4 });
    expect(d.total.causas.receita).toMatch(/câmbio/);
    expect(dia(d, "2026-10-25").valores.vendas).toBe(2);
    expect(d.colunas.find((c) => c.chave === "receita")!.dica).toMatch(/indisponível/);
  });
  it("(d) carregando: Meta, Google, vendas ou a série → skeleton", () => {
    expect(montarDadosDiariosDoLyrio(entrada({ meta: { temCampanhas: true, linhas: undefined } })).carregando).toBe(true);
    expect(montarDadosDiariosDoLyrio(entrada({ google: { mostrar: true, trafego: { tipo: "carregando" } } })).carregando).toBe(true);
    expect(montarDadosDiariosDoLyrio(entrada({ vendas: { tipo: "carregando" } })).carregando).toBe(true);
    expect(montarDadosDiariosDoLyrio(entrada({ serieCarregando: true })).carregando).toBe(true);
    expect(montarDadosDiariosDoLyrio(entrada()).carregando).toBe(false);
  });
});

describe("Nenhuma janela misturada", () => {
  it("Meta com um dia fora da janela → a Meta fica “—” (não soma outra janela no Total)", () => {
    const d = montarDadosDiariosDoLyrio(entrada({ meta: { temCampanhas: true, linhas: [...LINHAS_META, meta("2026-10-21", "1.00", 1, 1)] } }));
    expect(d.total.valores.investMeta).toBeNull();
    expect(d.total.causas.investMeta).toMatch(/fora da janela \(21\/10/);
    expect(d.avisos.join(" ")).toMatch(/outra janela/);
  });
  it("vendas de outro `days`, de outro `desde`, com dia fora da janela ou com diário que não fecha → “—” nas vendas", () => {
    const casos: [Partial<VendasPorCanalDoLyrio>, RegExp][] = [
      [{ days: 28 }, /28 dias, não os 7 do filtro/],
      [{ desde: "2026-10-21" }, /começa em 21\/10, não em 22\/10/],
      [{ diario: [...VENDAS.diario!, { dia: "2026-10-29", vendas: 1, receitaUsd: 1 }], totalPago: { vendas: 5, compradores: 5, receitaUsd: 4 } }, /traz venda em 29\/10/],
      [{ diario: [{ dia: "2026-10-23", vendas: 1, receitaUsd: 1 }] }, /não fecha com o total pago/],
      [{ diario: [{ dia: "2026-10-23", vendas: 4, receitaUsd: 2.99 }] }, /não fecha com o total pago/],
    ];
    for (const [p, causa] of casos) {
      const d = montarDadosDiariosDoLyrio(entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, ...p } } }));
      expect(d.total.valores.vendas, String(causa)).toBeNull();
      expect(d.total.causas.vendas, String(causa)).toMatch(causa);
      expect(d.dias.every((x) => x.valores.vendas == null)).toBe(true);
    }
  });
  it("Google cujas linhas por dia não somam o total do card → o Google fica “—”", () => {
    const pronto = trafegoDoGoogleNaRegua(CONTA, CONSULTAS_GOOGLE, DIAS, HOJE);
    if (pronto.tipo !== "pronto") throw new Error("fixture");
    const d = montarDadosDiariosDoLyrio(entrada({ google: { mostrar: true, trafego: { ...pronto, spend: 9.01 } } }));
    expect(d.total.valores.investGoogle).toBeNull();
    expect(d.total.causas.investGoogle).toMatch(/não somam/);
  });
});

describe("fecharNoMaiorDia / formatarCelula", () => {
  it("o resto fica no maior; os outros arredondados; a soma é o total", () => {
    expect(fecharNoMaiorDia(3.012, [1.004, 1.004, 1.004])).toEqual([1.01, 1, 1]);
    expect(fecharNoMaiorDia(2.01, [0, 2.01, 0])).toEqual([0, 2.01, 0]);
    expect(fecharNoMaiorDia(1, [])).toEqual([]);
  });
  it("“—” para null; moeda, inteiro, % e ROAS", () => {
    expect(formatarCelula("moeda", null)).toBe("—");
    expect(formatarCelula("moeda", 1234.5)).toBe("R$ 1.234,50");
    expect(formatarCelula("inteiro", 3050)).toBe("3.050");
    expect(formatarCelula("percentual", 1.05)).toBe("1,05%");
    expect(formatarCelula("roas", 2)).toBe("2.00x");
  });
});
