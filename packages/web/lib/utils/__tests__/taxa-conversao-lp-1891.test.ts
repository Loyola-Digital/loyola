import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  txConvConsolidada,
  txConvMidiaPaga,
  MENSAGEM_SEM_CONSOLIDADA,
} from "@loyola-x/shared/src/taxa-conversao-lp";
import {
  buildDailyRows,
  computeTotals,
  overrideCplWithUniqueIngressos,
} from "../funnel-metrics";
import { calculateFreeMetrics, calculatePaidMetrics } from "../lp-metrics-calculator";
import {
  deriveDailyMetrics,
  sumDailyMetrics,
  vendasAtribuidasPorDia,
  type DailyMetricsInput,
} from "../perpetual-daily-metrics";
import { buildLpAdInputs, type EntityDailyAdRow } from "../perpetual-lp-ads";
import { buildLpRows } from "../perpetual-lp-rows";

// Story 18.91 (fatia A) — a Tx Conv. Mídia Paga com uma definição só, em todas
// as telas; a Consolidada com "—" e o motivo enquanto as visitas não chegam.

describe("Story 18.91 — a fórmula única (AC1, AC3, AC4)", () => {
  it("Mídia Paga = resultado pago ÷ LP View × 100; sem LP View, '—'", () => {
    expect(txConvMidiaPaga(12, 400)).toBeCloseTo(3);
    expect(txConvMidiaPaga(12, 0)).toBeNull();
  });

  it("Consolidada sem visitas carrega o motivo — nunca vira 0%", () => {
    expect(txConvConsolidada(50, { motivo: "pendente" })).toEqual({ valor: null, motivo: "pendente" });
    expect(txConvConsolidada(50, { motivo: "erro" }).motivo).toBe("erro");
    expect(txConvConsolidada(50, 1000)).toEqual({ valor: 5 });
    expect(MENSAGEM_SEM_CONSOLIDADA.sem_filtro).toMatch(/página da etapa/);
  });
});

const meta = (spend: number, linkClicks: number, lpView: number) => ({
  spend, impressions: 10000, linkClicks, lpView, checkoutInitiations: 0,
});
const planilha = (leadsPagos: number, leadsOrg = 0) => ({
  leadsPagos, leadsOrg, leadsSemTrack: 0, faturamento: 0, leadsByMedium: {},
});

describe("Story 18.91 — Dados diários do lançamento (AC6)", () => {
  const rows = buildDailyRows(
    new Map([
      ["2026-10-01", meta(100, 200, 100)],
      ["2026-10-02", meta(100, 300, 50)],
    ]),
    new Map([
      ["2026-10-01", planilha(10, 5)],
      ["2026-10-02", planilha(5)],
    ]),
  );

  it("Gratuita: leads pagos ÷ LP View (não mais ÷ cliques)", () => {
    expect(rows[0].txConvMidiaPaga).toBeCloseTo(10); // 10 ÷ 100, e não 10 ÷ 200
    expect(rows[1].txConvMidiaPaga).toBeCloseTo(10); // 5 ÷ 50
  });

  it("Total: soma dos leads ÷ soma do LP View", () => {
    expect(computeTotals(rows).txConvMidiaPaga).toBeCloseTo(10); // 15 ÷ 150
  });

  it("Captação Paga: ingressos únicos pagos ÷ LP View", () => {
    const paga = overrideCplWithUniqueIngressos(rows[0], 4, 9);
    expect(paga.txConvMidiaPaga).toBeCloseTo(4); // 4 ÷ 100
  });

  it("Consolidada: '—' com o motivo, por dia e no total", () => {
    expect(rows[0].txConvConsolidada).toEqual({ valor: null, motivo: "pendente" });
    expect(computeTotals(rows).txConvConsolidada.motivo).toBe("pendente");
  });
});

describe("Story 18.91 — Testes de LPs (AC8, AC9)", () => {
  const base = { investimento: 100, cliques: 200, impressoes: 10000, conversoes: 200, lpViews: 80 };

  it("Gratuita: leads da LP ÷ LP View da LP; a taxa antiga (cliques) continua para o TESTE", () => {
    const m = calculateFreeMetrics({ ...base, leads: 8 });
    expect(m.txConvMidiaPaga).toBeCloseTo(10);
    expect(m.txConv).toBeCloseTo(4);
  });

  it("Paga: ingressos únicos da LP ÷ LP View da LP", () => {
    const m = calculatePaidMetrics({ ...base, ingressosUnicos: 4, revenueTotal: 0 });
    expect(m.txConvMidiaPaga).toBeCloseTo(5);
  });

  const tabela = readFileSync(
    new URL("../../components/funnels/lp-performance-table.tsx", import.meta.url),
    "utf8",
  );
  const teste = readFileSync(
    new URL("../../../components/funnels/meta-ads-teste-section.tsx", import.meta.url),
    "utf8",
  );

  it("a tabela troca a 'Tx Conv.' pelas duas colunas; só o TESTE pede a antiga, com observação", () => {
    expect(tabela).toContain('label: "Tx Conv. Mídia Paga (%)"');
    expect(tabela).toContain('label: "Tx Conv. Consolidada (%)"');
    expect(tabela).toMatch(/taxaAntiga\s*\?\s*\[\{ key: "txConv"/);
    expect(teste).toMatch(/<LpPerformanceTable\s+taxaAntiga/);
    expect(teste).toContain("segue a definição anterior");
  });
});

describe("Story 18.91 — Funil de Conversão (AC7)", () => {
  const lancamento = readFileSync(
    new URL("../../../components/funnels/launch-dashboard.tsx", import.meta.url),
    "utf8",
  );
  const funil = readFileSync(
    new URL("../../../components/funnels/conversion-funnel.tsx", import.meta.url),
    "utf8",
  );

  it("o passo LP View → resultado mostra as duas taxas pelo nome", () => {
    expect(funil).toContain('prev?.chave === "lpView" && stage.chave === "resultado"');
    expect(funil).toContain("↓ Mídia Paga {pct(passoDaLp.midiaPaga)} · Consolidada");
  });

  it("Captação Paga: a barra vira Ingressos únicos e a Mídia Paga usa os pagos", () => {
    expect(lancamento).toContain('leadsLabel={ehPaga ? "Ingressos únicos" : undefined}');
    expect(lancamento).toContain("leads={ehPaga ? (ingressosNoPeriodo?.totais ?? null) : metrics.totalLeads}");
    expect(lancamento).toContain("ehPaga ? (ingressosNoPeriodo?.pagos ?? 0) : metrics.leadsPagos");
  });
});

const dia = (o: Partial<DailyMetricsInput>): DailyMetricsInput => ({
  spend: 0, revenue: 0, margin: 0, salesCount: 0, impressions: 0, linkClicks: 0, lpViews: 0, ...o,
});

describe("Story 18.91 — Dados Diários do Perpétuo (AC10)", () => {
  it("vendas atribuídas a anúncio ÷ LP View; sem a série por anúncio, '—'", () => {
    expect(deriveDailyMetrics(dia({ lpViews: 200, vendasAtribuidas: 6, salesCount: 9 })).txConvMidiaPaga).toBeCloseTo(3);
    expect(deriveDailyMetrics(dia({ lpViews: 200, salesCount: 9 })).txConvMidiaPaga).toBeNull();
  });

  it("o total soma as vendas atribuídas e o LP View antes de dividir", () => {
    const total = sumDailyMetrics([
      dia({ lpViews: 100, vendasAtribuidas: 1 }),
      dia({ lpViews: 300, vendasAtribuidas: 7 }),
    ]);
    expect(deriveDailyMetrics(total).txConvMidiaPaga).toBeCloseTo(2); // 8 ÷ 400, não média de 1% e 2,33%
  });

  it("só entram as vendas de anúncios do funil", () => {
    const porDia = vendasAtribuidasPorDia(
      {
        a1: { salesByDay: { "2026-10-01": 2, "2026-10-02": 1 } },
        a2: { salesByDay: { "2026-10-01": 3 } },
        "(sem origem)": { salesByDay: { "2026-10-01": 50 } },
      },
      ["a1", "a2"],
    );
    expect(Object.fromEntries(porDia)).toEqual({ "2026-10-01": 5, "2026-10-02": 1 });
  });
});

describe("Story 18.91 — Desempenho por LP do Perpétuo (AC11, AC12)", () => {
  const linha = (entityId: string, lpv?: number): EntityDailyAdRow => ({
    entityId, dateStart: "2026-10-01", spend: 10, impressions: 100, clicks: 5, linkClicks: 4,
    ...(lpv === undefined ? {} : { landingPageViews: lpv }),
  });
  const semImposto = (s: number) => s;
  const vendas = new Map([["a1", { vendas: 2, bruto: 200 }], ["a2", { vendas: 1, bruto: 100 }]]);

  it("vendas da LP ÷ LP View somado nos anúncios da LP", () => {
    const ads = buildLpAdInputs([linha("a1", 30), linha("a2", 10)], vendas, semImposto);
    const [lp] = buildLpRows(ads, { a1: "https://x.com/lpa", a2: "https://x.com/lpa" }, [], 0, []);
    expect(lp.lpViews).toBe(40);
    expect(lp.txConvMidiaPaga).toBeCloseTo(7.5); // 3 ÷ 40
    expect(lp.txConvConsolidada.motivo).toBe("pendente");
  });

  it("API anterior à v55 (sem landingPageViews): '—', nunca 0% nem taxa inflada", () => {
    const ads = buildLpAdInputs([linha("a1", 30), linha("a2")], vendas, semImposto);
    const [lp] = buildLpRows(ads, { a1: "https://x.com/lpa", a2: "https://x.com/lpa" }, [], 0, []);
    expect(lp.lpViews).toBeNull();
    expect(lp.txConvMidiaPaga).toBeNull();
  });
});

// Gate @qa (TEST-001): reverter a biblioteca não prova que a tela está ligada a
// ela. Cada `it` abaixo cai se a coluna sumir, trocar de métrica ou de lugar.
describe("Story 18.91 — o fio das telas (gate @qa TEST-001)", () => {
  const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const diario = ler("../../../components/funnels/crossed-funnel-daily-table.tsx");
  const perpetuo = ler("../../../components/funnels/perpetual-dashboard.tsx");
  const tabelaLps = ler("../../components/funnels/lp-performance-table.tsx");

  it("Dados diários do lançamento: as duas colunas no cabeçalho, antes de Cliques", () => {
    expect(diario).toMatch(
      /Tx Conv\. Mídia Paga\s*<\/TableHead>\s*<TableHead[^>]*title=\{TT\.txconvConsolidada\}[^>]*>\s*Tx Conv\. Consolidada\s*<\/TableHead>\s*<TableHead[^>]*>\s*Cliques/,
    );
  });

  it("Dados diários do lançamento: cada linha e o total trazem as duas células, na mesma ordem", () => {
    const linha =
      /\{fmtPercent\(r\.txConvMidiaPaga\)\}\s*<\/TableCell>\s*<CelulaConsolidada taxa=\{r\.txConvConsolidada\} \/>\s*<TableCell[^>]*>\s*\{fmtInt\(r\.linkClicks\)\}/;
    const total =
      /\{fmtPercent\(totals\.txConvMidiaPaga\)\}\s*<\/TableCell>\s*<CelulaConsolidada taxa=\{totals\.txConvConsolidada\} \/>\s*<TableCell[^>]*>\s*\{fmtInt\(totals\.linkClicks\)\}/;
    expect(diario).toMatch(linha);
    expect(diario).toMatch(total);
    // A Consolidada sem número mostra o motivo, não 0% (AC4).
    expect(diario).toContain("title={taxa.motivo ? MENSAGEM_SEM_CONSOLIDADA[taxa.motivo] : undefined}");
  });

  function colunaDoPerpetuo(chave: string): string {
    const inicio = perpetuo.indexOf(`key: "${chave}",`);
    expect(inicio).toBeGreaterThan(-1);
    const fim = perpetuo.indexOf("key: \"", inicio + 10);
    return perpetuo.slice(inicio, fim);
  }

  it("Dados Diários do Perpétuo: as duas colunas, nos dois modos, com a métrica certa", () => {
    const paga = colunaDoPerpetuo("txConvMidiaPaga");
    const consolidada = colunaDoPerpetuo("txConvConsolidada");
    expect(paga).toContain("render: (_v, m) => fmtPercent(m.txConvMidiaPaga)");
    expect(consolidada).toContain("render: (_v, m) => fmtPercent(m.txConvConsolidada.valor)");
    expect(consolidada).toContain("MENSAGEM_SEM_CONSOLIDADA.pendente");
    expect(paga + consolidada).not.toContain("detailedOnly");
  });

  it("Dados Diários do Perpétuo: o quadro recebe as linhas com as vendas atribuídas", () => {
    expect(perpetuo).toContain("<PerpetualDailyTable rows={dailyRowsDoQuadro}");
    expect(perpetuo).toContain("lpEntityDaily.rows.map((r) => r.entityId)");
    expect(perpetuo).toContain("vendasAtribuidas: porDia.get(r.dateIso) ?? 0");
  });

  it("Desempenho por LP do Perpétuo: as duas células depois do ROAS, com o motivo", () => {
    expect(perpetuo).toMatch(
      /\{fmtRoas\(row\.roas\)\}<\/td>\s*<td className="text-right px-2 tabular-nums">\{fmtPercent\(row\.txConvMidiaPaga\)\}<\/td>\s*<td[\s\S]{0,300}?title=\{row\.txConvConsolidada\.motivo \? MENSAGEM_SEM_CONSOLIDADA\[row\.txConvConsolidada\.motivo\] : undefined\}[\s\S]{0,80}?\{fmtPercent\(row\.txConvConsolidada\.valor\)\}/,
    );
  });

  it("Testes de LPs: a Consolidada sem número mostra o motivo no tooltip", () => {
    expect(tabelaLps).toContain('if (chave === "txConvConsolidada" && valor === null) {');
    expect(tabelaLps).toContain("title={MENSAGEM_SEM_CONSOLIDADA.pendente}");
  });
});
