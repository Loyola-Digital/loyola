import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { DashboardDaAplicacao, QuebraPorOrigem } from "@/lib/hooks/use-stage-application";
import {
  aplicacoesPagasDoResumo,
  diasDaMeta,
  montarDadosDiariosDaAplicacao,
} from "@/lib/utils/dados-diarios-da-aplicacao";

// Story 18.96 — investimento e "Dados diários" da etapa de Aplicação.
// Datas de 2026: o investimento leva o imposto de 12,15% (gross-up).

const IMPOSTO = 1 / (1 - 0.1215);

function insight(date: string, spend: number, impressions = 0, linkClicks = 0, lpViews = 0): CampaignDailyInsight {
  return {
    date_start: date,
    date_stop: date,
    spend: String(spend),
    impressions: String(impressions),
    actions: [
      { action_type: "link_click", value: String(linkClicks) },
      { action_type: "landing_page_view", value: String(lpViews) },
    ],
  } as unknown as CampaignDailyInsight;
}

function origem(o: string, aplicacoes: number): QuebraPorOrigem {
  return { origem: o, vendas: 0, valor: 0, aplicacoes, converteram: 0 };
}

function dashboard(over: Partial<DashboardDaAplicacao> = {}): Pick<DashboardDaAplicacao, "resumo" | "diarioDeAplicacoes"> {
  return {
    resumo: {
      aplicacoes: 7,
      vendas: 0,
      valorTotal: 0,
      converteram: 0,
      taxaDeConversao: 0,
      porUtmSource: [origem("meta", 3), origem("organico", 2), origem("Sem Track", 2)],
      porUtmMedium: [],
    },
    diarioDeAplicacoes: {
      dias: {
        // só aplicação
        "2026-10-20": { total: 2, pagas: 1 },
        // aplicação + investimento
        "2026-10-21": { total: 3, pagas: 2 },
      },
      semData: { total: 2, pagas: 0 },
    },
    ...over,
  };
}

// 2026-10-21: aplicação + gasto · 2026-10-22: só gasto · 2026-10-20: só aplicação
const META = [
  insight("2026-10-21", 100, 10_000, 200, 150),
  insight("2026-10-22", 50, 5_000, 50, 80),
];

describe("Story 18.96 — linhas por dia (AC5)", () => {
  const d = montarDadosDiariosDaAplicacao({ meta: META, temCampanha: true, dashboard: dashboard() });

  it("dia só com aplicação, só com investimento e com os dois; mais recente primeiro", () => {
    expect(d.dias.map((r) => r.date)).toEqual(["2026-10-22", "2026-10-21", "2026-10-20"]);
    const [so22, ambos21, so20] = d.dias;
    expect(so22.aplicacoes).toBe(0);
    expect(so22.investimento).toBeCloseTo(50 * IMPOSTO, 6);
    expect(so20.investimento).toBe(0);
    expect(so20.aplicacoes).toBe(2);
    expect(ambos21.investimento).toBeCloseTo(100 * IMPOSTO, 6);
  });

  it("custo pago divide pelas aplicações DA META; o geral, por todas", () => {
    const dia21 = d.dias[1];
    expect(dia21.custoPorAplicacaoPaga).toBeCloseTo((100 * IMPOSTO) / 2, 6);
    expect(dia21.custoPorAplicacaoGeral).toBeCloseTo((100 * IMPOSTO) / 3, 6);
  });

  it("custo \"—\" (null) com denominador 0", () => {
    const so22 = d.dias[0];
    expect(so22.custoPorAplicacaoPaga).toBeNull();
    expect(so22.custoPorAplicacaoGeral).toBeNull();
  });

  it("CTR em %, CPM e CPC pelo clique no link", () => {
    const dia21 = d.dias[1];
    expect(dia21.ctr).toBeCloseTo(2, 6); // 200 / 10.000 × 100
    expect(dia21.cpm).toBeCloseTo((100 * IMPOSTO * 1000) / 10_000, 6);
    expect(dia21.cpc).toBeCloseTo((100 * IMPOSTO) / 200, 6);
  });
});

describe("Story 18.96 — Sem data e Total (AC6, AC7)", () => {
  const d = montarDadosDiariosDaAplicacao({ meta: META, temCampanha: true, dashboard: dashboard() });

  it("linha Sem data com as aplicações e a Meta em —", () => {
    expect(d.semData).not.toBeNull();
    expect(d.semData?.aplicacoes).toBe(2);
    expect(d.semData?.investimento).toBeNull();
    expect(d.semData?.custoPorAplicacaoGeral).toBeNull();
  });

  it("sem aplicação sem data, a linha não existe", () => {
    const sem = montarDadosDiariosDaAplicacao({
      meta: META,
      temCampanha: true,
      dashboard: dashboard({ diarioDeAplicacoes: { dias: { "2026-10-21": { total: 1, pagas: 1 } }, semData: { total: 0, pagas: 0 } } }),
    });
    expect(sem.semData).toBeNull();
  });

  it("Total soma dias + Sem data e recalcula as derivadas (nunca média)", () => {
    const t = d.total!;
    expect(t.aplicacoes).toBe(7); // 2 + 3 + 2 sem data = card Aplicações
    expect(t.aplicacoesPagas).toBe(3);
    expect(t.investimento).toBeCloseTo(150 * IMPOSTO, 6);
    expect(t.custoPorAplicacaoGeral).toBeCloseTo((150 * IMPOSTO) / 7, 6);
    expect(t.custoPorAplicacaoPaga).toBeCloseTo((150 * IMPOSTO) / 3, 6);
    expect(t.ctr).toBeCloseTo((250 / 15_000) * 100, 6);
    expect(t.cpc).toBeCloseTo((150 * IMPOSTO) / 250, 6);
    // Média dos CPCs diários seria outra coisa: prova que não é.
    const mediaDosCpc = (d.dias[0].cpc! + d.dias[1].cpc!) / 2;
    expect(t.cpc).not.toBeCloseTo(mediaDosCpc, 6);
  });

  it("os cards SÃO o Total: Σ investimento da tabela = card, aplicações = card", () => {
    const somaInv = d.dias.reduce((s, r) => s + (r.investimento ?? 0), 0);
    expect(d.cards?.investimento).toBeCloseTo(somaInv, 6);
    expect(d.cards).toEqual(d.total);
    expect(d.cards?.aplicacoes).toBe(dashboard().resumo.aplicacoes);
  });
});

describe("Story 18.96 — sem campanha vinculada (AC3, AC5)", () => {
  const d = montarDadosDiariosDaAplicacao({ meta: META, temCampanha: false, dashboard: dashboard() });

  it("sem cards e sem Meta nas linhas — só as aplicações", () => {
    expect(d.cards).toBeNull();
    expect(d.dias.map((r) => r.date)).toEqual(["2026-10-21", "2026-10-20"]);
    expect(d.dias.every((r) => r.investimento === null && r.custoPorAplicacaoGeral === null)).toBe(true);
    expect(d.total?.aplicacoes).toBe(7);
  });
});

describe("Story 18.96 — janela Tudo (AC4)", () => {
  it("Tudo pede 365 dias à Meta; janelas maiores são cortadas", () => {
    expect(diasDaMeta(null)).toBe(365);
    expect(diasDaMeta(30)).toBe(30);
    expect(diasDaMeta(400)).toBe(365);
  });

  it("dia de aplicação anterior à janela da Meta fica com a Meta em —, não R$ 0", () => {
    const d = montarDadosDiariosDaAplicacao({
      meta: META,
      temCampanha: true,
      dashboard: dashboard(),
      metaDesde: "2026-10-21",
    });
    const dia20 = d.dias.find((r) => r.date === "2026-10-20")!;
    expect(dia20.investimento).toBeNull();
    expect(dia20.aplicacoes).toBe(2);
  });
});

describe("Story 18.96 — API anterior ao contrato 57 (AC9)", () => {
  const d = montarDadosDiariosDaAplicacao({
    meta: META,
    temCampanha: true,
    dashboard: dashboard({ diarioDeAplicacoes: undefined }),
  });

  it("cards pelo resumo: geral = card Aplicações, pago = origens meta/meta-ads", () => {
    expect(d.temAplicacoesPorDia).toBe(false);
    expect(d.cards?.aplicacoes).toBe(7);
    expect(d.cards?.aplicacoesPagas).toBe(3);
    expect(d.cards?.custoPorAplicacaoPaga).toBeCloseTo((150 * IMPOSTO) / 3, 6);
  });

  it("dias só com a Meta, aplicações em —", () => {
    expect(d.dias.map((r) => r.date)).toEqual(["2026-10-22", "2026-10-21"]);
    expect(d.dias.every((r) => r.aplicacoes === null && r.custoPorAplicacaoGeral === null)).toBe(true);
    expect(d.semData).toBeNull();
  });

  it("a origem Meta é a do shared: google-ads não entra, caixa e espaço não importam", () => {
    expect(aplicacoesPagasDoResumo([origem(" Meta-Ads ", 4), origem("meta", 1), origem("google-ads", 9)])).toBe(5);
  });
});

describe("Story 18.96 — sem dados (AC7)", () => {
  it("sem aplicação e sem investimento, não há tabela", () => {
    const d = montarDadosDiariosDaAplicacao({
      meta: [],
      temCampanha: true,
      dashboard: dashboard({ diarioDeAplicacoes: { dias: {}, semData: { total: 0, pagas: 0 } } }),
    });
    expect(d.total).toBeNull();
    expect(d.dias).toEqual([]);
  });
});

describe("Story 18.96 — o fio da tela (AC1, AC2)", () => {
  const tela = readFileSync(
    new URL("../../../components/funnels/application-stage-view.tsx", import.meta.url),
    "utf8",
  );

  it("o seletor de campanhas está no Configurar e só carrega com o sheet aberto", () => {
    expect(tela).toContain("useCampaignPicker(configOpen ? projectId : null)");
    expect(tela).toMatch(/<CampaignSelector[\s\S]*?value=\{stage\.campaigns\}/);
    expect(tela).toContain("atualizarEtapa.mutate(\n                          { campaigns },");
  });

  it("a seção recebe as campanhas da etapa, a janela e o dashboard", () => {
    expect(tela).toContain("const campaignIds = (stage.campaigns ?? []).map((c) => c.id);");
    expect(tela).toMatch(/<ApplicationInvestmentSection[\s\S]*?campaignIds=\{campaignIds\}[\s\S]*?dias=\{dias\}[\s\S]*?dashboard=\{data\}/);
  });
});
