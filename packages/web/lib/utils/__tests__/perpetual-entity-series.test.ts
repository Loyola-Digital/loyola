import { describe, it, expect } from "vitest";
import {
  buildEntitySeries,
  toRechartsRows,
  totalForDate,
  UNATTRIBUTED_SERIES_KEY,
  TOP_N_SERIES,
  type BuildSeriesParams,
} from "../perpetual-entity-series";

const semNormalizacao = (_id: string, fallback: string) => fallback;

/** A MESMA regra date-aware do dashboard: gross-up so a partir de 2026-01-01. */
const grossUp = (spend: number, dia: string) =>
  dia >= "2026-01-01" ? spend / (1 - 0.1215) : spend;

const params = (over: Partial<BuildSeriesParams> = {}): BuildSeriesParams => ({
  rows: [],
  unattributedByDate: {},
  salesByEntity: null,
  feeRate: 0,
  resolveName: semNormalizacao,
  applyTax: (v: number) => v,
  ...over,
});

describe("buildEntitySeries — agregacao", () => {
  it("uma serie por entidade, com investimento por dia", () => {
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "Campanha A", dateStart: "2026-08-01", spend: 100 },
        { entityId: "1", entityName: "Campanha A", dateStart: "2026-08-02", spend: 150 },
        { entityId: "2", entityName: "Campanha B", dateStart: "2026-08-01", spend: 50 },
      ],
    }));
    expect(r.all.map((s) => s.key)).toEqual(["Campanha A", "Campanha B"]);
    expect(r.all[0].totalSpend).toBe(250);
    expect(r.all[0].byDate["2026-08-01"].spend).toBe(100);
    expect(r.dates).toEqual(["2026-08-01", "2026-08-02"]);
  });

  it("agrupa por NOME resolvido — copias somam na linha base, como no Detalhamento", () => {
    const normaliza = (_id: string, nome: string) => nome.replace(/ — Cópia$/, "");
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "Criativo X", dateStart: "2026-08-01", spend: 100 },
        { entityId: "2", entityName: "Criativo X — Cópia", dateStart: "2026-08-01", spend: 40 },
      ],
      resolveName: normaliza,
    }));
    expect(r.all).toHaveLength(1);
    expect(r.all[0].key).toBe("Criativo X");
    expect(r.all[0].byDate["2026-08-01"].spend).toBe(140);
  });

  it("casa receita/vendas pelos ids que compoem o nome", () => {
    const normaliza = (_id: string, nome: string) => nome.replace(/ — Cópia$/, "");
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "Criativo X", dateStart: "2026-08-01", spend: 100 },
        { entityId: "2", entityName: "Criativo X — Cópia", dateStart: "2026-08-01", spend: 40 },
      ],
      resolveName: normaliza,
      salesByEntity: {
        "1": { revenueByDay: { "2026-08-01": 500 }, salesByDay: { "2026-08-01": 2 } },
        "2": { revenueByDay: { "2026-08-01": 300 }, salesByDay: { "2026-08-01": 1 } },
      },
    }));
    const p = r.all[0].byDate["2026-08-01"];
    expect(p.revenue).toBe(800);
    expect(p.sales).toBe(3);
    // CAC re-derivado dos somatorios: 140 / 3
    expect(p.cac).toBeCloseTo(140 / 3, 10);
  });
});

describe("buildEntitySeries — taxas re-derivadas, nunca media de medias", () => {
  it("CAC do grupo sai dos somatorios, nao da media dos CACs", () => {
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "X", dateStart: "2026-08-01", spend: 1000 },
        { entityId: "2", entityName: "X", dateStart: "2026-08-01", spend: 10 },
      ],
      salesByEntity: {
        "1": { revenueByDay: {}, salesByDay: { "2026-08-01": 1 } },   // CAC 1000
        "2": { revenueByDay: {}, salesByDay: { "2026-08-01": 100 } }, // CAC 0,10
      },
    }));
    const cac = r.all[0].byDate["2026-08-01"].cac as number;
    // Somatorios: 1010 / 101 = 10. Media das taxas daria 500,05 — quase 50x maior.
    expect(cac).toBeCloseTo(10, 10);
    expect(cac).not.toBeCloseTo((1000 + 0.1) / 2, 1);
  });

  it("margem % re-derivada do somatorio, com fee da plataforma", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "X", dateStart: "2026-08-01", spend: 100 }],
      salesByEntity: { "1": { revenueByDay: { "2026-08-01": 1000 }, salesByDay: {} } },
      feeRate: 0.1,
    }));
    const p = r.all[0].byDate["2026-08-01"];
    expect(p.margin).toBeCloseTo(1000 * 0.9 - 100, 10); // 800
    expect(p.marginPct).toBeCloseTo(80, 10);
  });
});

describe("buildEntitySeries — ausencia nunca vira zero", () => {
  it("dia sem gasto nem venda NAO entra no mapa da serie", () => {
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 100 },
        { entityId: "2", entityName: "B", dateStart: "2026-08-02", spend: 50 },
      ],
    }));
    const a = r.all.find((s) => s.key === "A")!;
    expect(a.byDate["2026-08-01"]).toBeDefined();
    // A nao rodou no dia 02: ausente, nao zero.
    expect(a.byDate["2026-08-02"]).toBeUndefined();
  });

  it("CAC sem venda e margem % sem receita ficam null, nunca Infinity", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 100 }],
    }));
    const p = r.all[0].byDate["2026-08-01"];
    expect(p.cac).toBeNull();
    expect(p.marginPct).toBeNull();
    expect(Number.isFinite(p.cac as number)).toBe(false);
  });

  it("toRechartsRows devolve undefined no dia ausente — lacuna, nao zero", () => {
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 100 },
        { entityId: "2", entityName: "B", dateStart: "2026-08-02", spend: 50 },
      ],
    }));
    const rows = toRechartsRows(r.plotted, r.dates, "spend");
    expect(rows[1]["A"]).toBeUndefined();
    expect(rows[1]["A"]).not.toBe(0);
  });
});

describe("buildEntitySeries — reconciliacao (AC0/AC10)", () => {
  it("soma das series + nao-atribuido = agregado do dia", () => {
    // Cenario da medicao do @po: o grao de anuncio nao cobre tudo.
    const agregadoDoDia = 1000;
    const r = buildEntitySeries(params({
      rows: [
        { entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 600 },
        { entityId: "2", entityName: "B", dateStart: "2026-08-01", spend: 385 },
      ],
      unattributedByDate: { "2026-08-01": 15 },
    }));
    expect(totalForDate(r.all, "2026-08-01", "spend")).toBeCloseTo(agregadoDoDia, 8);
  });

  it("o nao-atribuido e uma SERIE visivel, nao um resto que some", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 600 }],
      unattributedByDate: { "2026-08-01": 15 },
    }));
    expect(r.all.map((s) => s.key)).toContain(UNATTRIBUTED_SERIES_KEY);
  });

  it("sem nao-atribuido (dimensao campanha), a serie extra nao aparece", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 600 }],
      unattributedByDate: {},
    }));
    expect(r.all.map((s) => s.key)).not.toContain(UNATTRIBUTED_SERIES_KEY);
    expect(totalForDate(r.all, "2026-08-01", "spend")).toBe(600);
  });

  // ---- Gate QA-01: a reconciliacao das OUTRAS duas metricas. Estes tres
  // casos eram o ponto cego — o teste original so cobria `spend`.
  it("faturamento e vendas sem UTM entram no residuo, nao somem", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "ad_1", entityName: "A", dateStart: "2026-08-01", spend: 100 }],
      salesByEntity: {
        ad_1: { revenueByDay: { "2026-08-01": 500 }, salesByDay: { "2026-08-01": 1 } },
        // Rotulo que o backend usa para venda sem UTM — nunca e um entityId.
        "(sem origem)": { revenueByDay: { "2026-08-01": 300 }, salesByDay: { "2026-08-01": 2 } },
      },
    }));
    expect(totalForDate(r.all, "2026-08-01", "revenue")).toBe(800);
    expect(totalForDate(r.all, "2026-08-01", "sales")).toBe(3);
  });

  it("venda de anuncio ausente do cache de insights entra no residuo", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "ad_1", entityName: "A", dateStart: "2026-08-01", spend: 100 }],
      salesByEntity: {
        ad_1: { revenueByDay: { "2026-08-01": 500 }, salesByDay: { "2026-08-01": 1 } },
        ad_deletado: { revenueByDay: { "2026-08-01": 200 }, salesByDay: { "2026-08-01": 1 } },
      },
    }));
    expect(totalForDate(r.all, "2026-08-01", "revenue")).toBe(700);
    expect(totalForDate(r.all, "2026-08-01", "sales")).toBe(2);
    expect(r.all.map((s) => s.key)).toContain(UNATTRIBUTED_SERIES_KEY);
  });

  it("as TRES metricas fecham ao mesmo tempo, com as duas ausencias juntas", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "ad_1", entityName: "A", dateStart: "2026-08-01", spend: 600 }],
      unattributedByDate: { "2026-08-01": 15 },          // gasto sem anuncio
      salesByEntity: {
        ad_1: { revenueByDay: { "2026-08-01": 500 }, salesByDay: { "2026-08-01": 1 } },
        "(sem origem)": { revenueByDay: { "2026-08-01": 300 }, salesByDay: { "2026-08-01": 2 } },
      },
    }));
    expect(totalForDate(r.all, "2026-08-01", "spend")).toBeCloseTo(615, 8);
    expect(totalForDate(r.all, "2026-08-01", "revenue")).toBe(800);
    expect(totalForDate(r.all, "2026-08-01", "sales")).toBe(3);
  });

  it("venda residual num dia sem investimento nenhum ainda entra no eixo X", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "ad_1", entityName: "A", dateStart: "2026-08-01", spend: 100 }],
      salesByEntity: {
        "(sem origem)": { revenueByDay: { "2026-08-03": 300 }, salesByDay: { "2026-08-03": 1 } },
      },
    }));
    expect(r.dates).toContain("2026-08-03");
    expect(totalForDate(r.all, "2026-08-03", "revenue")).toBe(300);
  });

  it("dia com gasto SO no nao-atribuido ainda entra no eixo X", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 100 }],
      unattributedByDate: { "2026-08-02": 30 },
    }));
    expect(r.dates).toEqual(["2026-08-01", "2026-08-02"]);
  });
});

describe("buildEntitySeries — imposto aplicado UMA vez (AC7)", () => {
  it("gross-up e divisao por (1 - 0,1215), nao markup", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 1000 }],
      applyTax: grossUp,
    }));
    expect(r.all[0].byDate["2026-08-01"].spend).toBeCloseTo(1000 / (1 - 0.1215), 8);
    // O erro classico: 1000 * 1,1215 = 1121,50 (markup em vez de gross-up).
    expect(r.all[0].byDate["2026-08-01"].spend).not.toBeCloseTo(1121.5, 1);
  });

  it("sem imposto no periodo, o spend fica intacto — sem imposto ao quadrado", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 1000 }],
      applyTax: (v: number) => v,
    }));
    expect(r.all[0].byDate["2026-08-01"].spend).toBe(1000);
  });

  it("o nao-atribuido recebe o MESMO tratamento de imposto que as demais", () => {
    const r = buildEntitySeries(params({
      rows: [{ entityId: "1", entityName: "A", dateStart: "2026-08-01", spend: 1000 }],
      unattributedByDate: { "2026-08-01": 1000 },
      applyTax: grossUp,
    }));
    const [a, b] = r.all;
    expect(a.byDate["2026-08-01"].spend).toBeCloseTo(b.byDate["2026-08-01"].spend as number, 8);
  });
});

describe("buildEntitySeries — teto de exibicao (AC5)", () => {
  const muitas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      entityId: String(i),
      entityName: `E${i}`,
      dateStart: "2026-08-01",
      // E0 gasta mais, E{n-1} menos.
      spend: (n - i) * 10,
    }));

  it("plota as 10 de MAIOR investimento", () => {
    const r = buildEntitySeries(params({ rows: muitas(25) }));
    expect(r.plotted).toHaveLength(TOP_N_SERIES);
    expect(r.plotted[0].key).toBe("E0");
    expect(r.omittedCount).toBe(15);
  });

  it("o teto corta o que e PLOTADO, nunca o que e somado", () => {
    const r = buildEntitySeries(params({ rows: muitas(25) }));
    expect(r.all).toHaveLength(25);
    // A reconciliacao opera sobre `all` e continua fechando.
    const esperado = muitas(25).reduce((s, x) => s + x.spend, 0);
    expect(totalForDate(r.all, "2026-08-01", "spend")).toBeCloseTo(esperado, 8);
  });

  it("a % das omitidas usa o total do CONJUNTO INTEIRO como denominador", () => {
    const rows = muitas(25);
    const r = buildEntitySeries(params({ rows }));
    const total = rows.reduce((s, x) => s + x.spend, 0);
    const omitido = [...rows].sort((a, b) => b.spend - a.spend).slice(TOP_N_SERIES)
      .reduce((s, x) => s + x.spend, 0);
    expect(r.omittedSpendShare).toBeCloseTo((omitido / total) * 100, 8);
  });

  // ---- Gate QA-07: o residuo nao disputa vaga. Estes casos cobrem o buraco
  // que a correcao da QA-01 abriu — os testes anteriores operavam sobre `all`
  // e o defeito morava no recorte de `plotted`.
  it("residuo COM receita e SEM investimento sobrevive ao teto (cenario Por Campanha)", () => {
    const r = buildEntitySeries(params({
      rows: muitas(15),
      unattributedByDate: {},   // Por Campanha: vazio por construcao
      salesByEntity: {
        "(sem origem)": { revenueByDay: { "2026-08-01": 50000 }, salesByDay: { "2026-08-01": 90 } },
      },
    }));
    expect(r.plotted.some((s) => s.key === UNATTRIBUTED_SERIES_KEY)).toBe(true);
    // O que o gestor ve tem que conter o faturamento residual.
    expect(totalForDate(r.plotted, "2026-08-01", "revenue")).toBe(50000);
    expect(totalForDate(r.plotted, "2026-08-01", "sales")).toBe(90);
  });

  it("o residuo NAO ocupa vaga de entidade — 10 entidades continuam plotadas", () => {
    const r = buildEntitySeries(params({
      rows: muitas(15),
      unattributedByDate: { "2026-08-01": 5 },
    }));
    const entidades = r.plotted.filter((s) => s.key !== UNATTRIBUTED_SERIES_KEY);
    expect(entidades).toHaveLength(TOP_N_SERIES);
    expect(r.plotted).toHaveLength(TOP_N_SERIES + 1);
  });

  it("o residuo nunca conta como omitido", () => {
    const r = buildEntitySeries(params({
      rows: muitas(15),
      unattributedByDate: { "2026-08-01": 999999 },  // residuo grande de proposito
    }));
    expect(r.omittedCount).toBe(5);                   // 15 - 10, sem o residuo
    // O denominador da nota e o investimento das ENTIDADES; um residuo enorme
    // nao pode diluir o percentual do que ficou de fora.
    const rows = muitas(15);
    const total = rows.reduce((s, x) => s + x.spend, 0);
    const omitido = [...rows].sort((a, b) => b.spend - a.spend).slice(TOP_N_SERIES)
      .reduce((s, x) => s + x.spend, 0);
    expect(r.omittedSpendShare).toBeCloseTo((omitido / total) * 100, 8);
  });

  it("`all` continua fechando a reconciliacao com o residuo no fim", () => {
    const r = buildEntitySeries(params({
      rows: muitas(15),
      unattributedByDate: { "2026-08-01": 20 },
      salesByEntity: {
        "(sem origem)": { revenueByDay: { "2026-08-01": 700 }, salesByDay: { "2026-08-01": 3 } },
      },
    }));
    expect(r.all[r.all.length - 1].key).toBe(UNATTRIBUTED_SERIES_KEY);
    const esperado = muitas(15).reduce((s, x) => s + x.spend, 0) + 20;
    expect(totalForDate(r.all, "2026-08-01", "spend")).toBeCloseTo(esperado, 8);
    expect(totalForDate(r.all, "2026-08-01", "revenue")).toBe(700);
  });

  it("com 10 ou menos, nada e omitido", () => {
    const r = buildEntitySeries(params({ rows: muitas(10) }));
    expect(r.omittedCount).toBe(0);
    expect(r.omittedSpendShare).toBe(0);
  });

  it("conjunto vazio nao divide por zero", () => {
    const r = buildEntitySeries(params({ rows: [] }));
    expect(r.omittedSpendShare).toBe(0);
    expect(r.plotted).toEqual([]);
  });
});
