import { describe, it, expect } from "vitest";
import {
  aggregateSeriesByGranularity,
  startOfWeekSunday,
  type DailySeriesPoint,
} from "../chart-granularity";

// Fee kiwify (0.2099) embutido na margem diária, como o dashboard faz.
const FEE = 0.2099;
const mkDay = (dateIso: string, spend: number, revenue: number, sales: number): DailySeriesPoint => ({
  dateIso,
  spend,
  spendBruto: spend * (1 - 0.1215),
  spendTax: spend * 0.1215,
  revenue,
  margin: revenue * (1 - FEE) - spend,
  sales,
});

// 05 e 06/02/2026 caem na mesma semana (dom 01/02 – sáb 07/02); 09/02 na
// semana seguinte; 02 e 03/03 em março.
const daily: DailySeriesPoint[] = [
  mkDay("2026-02-05", 100, 300, 3),
  mkDay("2026-02-06", 200, 500, 5),
  mkDay("2026-02-09", 50, 100, 1),
  mkDay("2026-03-02", 80, 400, 4),
  mkDay("2026-03-03", 20, 0, 0),
];

const sumMargin = (arr: { margin: number }[]) => arr.reduce((s, x) => s + x.margin, 0);

describe("startOfWeekSunday", () => {
  it("01/02/2026 é domingo → retorna ele mesmo", () => {
    expect(startOfWeekSunday("2026-02-01")).toBe("2026-02-01");
  });
  it("dias da semana caem no domingo anterior", () => {
    expect(startOfWeekSunday("2026-02-05")).toBe("2026-02-01");
    expect(startOfWeekSunday("2026-02-07")).toBe("2026-02-01"); // sábado
    expect(startOfWeekSunday("2026-02-08")).toBe("2026-02-08"); // próximo domingo
  });
});

describe("aggregateSeriesByGranularity — day", () => {
  it("mantém os pontos e formata rótulos DD/MM", () => {
    const out = aggregateSeriesByGranularity(daily, "day");
    expect(out).toHaveLength(5);
    expect(out[0].label).toBe("05/02");
    expect(out[0].rangeLabel).toBe("05/02/2026");
  });
});

describe("aggregateSeriesByGranularity — week (domingo)", () => {
  it("agrupa 05+06/02 no bucket do domingo 01/02 e soma os campos", () => {
    const week = aggregateSeriesByGranularity(daily, "week");
    const wk = week.find((w) => w.bucketKey === "2026-02-01")!;
    expect(wk.spend).toBe(300);
    expect(wk.revenue).toBe(800);
    expect(wk.sales).toBe(8);
    expect(wk.margin).toBeCloseTo((300 + 500) * (1 - FEE) - 300, 6);
    expect(wk.rangeLabel).toBe("01/02 – 07/02");
    expect(wk.label).toBe("01/02");
  });
  it("mantém ordem cronológica", () => {
    const week = aggregateSeriesByGranularity(daily, "week");
    const keys = week.map((w) => w.bucketKey);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("aggregateSeriesByGranularity — month", () => {
  it("agrupa fevereiro (3 dias) e formata rótulos", () => {
    const month = aggregateSeriesByGranularity(daily, "month");
    const fev = month.find((m) => m.bucketKey === "2026-02")!;
    expect(fev.spend).toBe(350);
    expect(fev.revenue).toBe(900);
    expect(fev.label).toBe("fev/26");
    expect(fev.rangeLabel).toBe("Fevereiro de 2026");
    expect(fev.margin).toBeCloseTo((300 + 500 + 100) * (1 - FEE) - 350, 6);
    expect(month).toHaveLength(2);
  });
});

describe("invariante de aditividade", () => {
  it("margem total é igual em day, week e month", () => {
    const day = sumMargin(aggregateSeriesByGranularity(daily, "day"));
    const week = sumMargin(aggregateSeriesByGranularity(daily, "week"));
    const month = sumMargin(aggregateSeriesByGranularity(daily, "month"));
    expect(week).toBeCloseTo(day, 6);
    expect(month).toBeCloseTo(day, 6);
  });
  it("série vazia → []", () => {
    expect(aggregateSeriesByGranularity([], "week")).toEqual([]);
    expect(aggregateSeriesByGranularity([], "month")).toEqual([]);
  });
});

// ============================================================================
// Story 29.60 — o agregador carrega `salesCount`, não só `sales`.
//
// ⚠️ O fixture tem pixel ≠ planilha DE PROPÓSITO. Com os dois iguais, trocar
// `salesCount` por `sales` não muda nada e o teste é decorativo. Os números
// vêm da divergência real medida no BBE em 17/07–23/08:
//
//     únicas (planilha) .... 115     linhas .... 140     pixel .... 98
//
// e do dia 22/07, onde a planilha registrou 8 compradores e o pixel, 6.
// ============================================================================

const mkDiaComDivergencia = (
  dateIso: string,
  pixel: number,
  unicas: number,
): DailySeriesPoint => ({
  dateIso,
  spend: 100,
  spendBruto: 100 * (1 - 0.1215),
  spendTax: 100 * 0.1215,
  revenue: 300,
  margin: 300 * (1 - FEE) - 100,
  sales: pixel,
  salesCount: unicas,
});

/** Dois dias da mesma semana + um da seguinte, todos com pixel < único. */
const comDivergencia: DailySeriesPoint[] = [
  mkDiaComDivergencia("2026-02-05", 6, 8),
  mkDiaComDivergencia("2026-02-06", 5, 7),
  mkDiaComDivergencia("2026-02-09", 2, 4),
];

describe("Story 29.60 — salesCount atravessa a agregação", () => {
  it("day: o único e o pixel chegam separados, cada um com seu valor", () => {
    const r = aggregateSeriesByGranularity(comDivergencia, "day");
    expect(r.map((d) => d.salesCount)).toEqual([8, 7, 4]);
    // Se `salesCount` caísse para `sales`, isto seria [6, 5, 2] — que é
    // exatamente o defeito que a story existe para evitar.
    expect(r.map((d) => d.sales)).toEqual([6, 5, 2]);
  });

  it("week: soma os únicos do bucket, não os do pixel", () => {
    const r = aggregateSeriesByGranularity(comDivergencia, "week");
    expect(r).toHaveLength(2);
    expect(r[0]!.salesCount).toBe(15); // 8 + 7
    expect(r[1]!.salesCount).toBe(4);
    // Sem o AC2, a semana plotaria 11 (6+5) enquanto o dia plota 8 e 7 — a
    // série mudaria de significado ao trocar o seletor de granularidade.
    expect(r[0]!.salesCount).not.toBe(r[0]!.sales);
  });

  it("month: idem", () => {
    const r = aggregateSeriesByGranularity(comDivergencia, "month");
    expect(r).toHaveLength(1);
    expect(r[0]!.salesCount).toBe(19); // 8 + 7 + 4
    expect(r[0]!.sales).toBe(13);      // 6 + 5 + 2
  });

  it("série sem o campo agrega como ZERO, não como buraco", () => {
    // `salesCount` é opcional na entrada: série montada por código anterior à
    // 29.60 continua agregando. `undefined` viraria buraco na linha do Recharts.
    const r = aggregateSeriesByGranularity(daily, "day");
    expect(r.every((d) => d.salesCount === 0)).toBe(true);
    expect(r.every((d) => typeof d.salesCount === "number")).toBe(true);
  });

  it("dia sem venda mantém o ponto na série, com zero (AC7)", () => {
    const comZero = [...comDivergencia, mkDiaComDivergencia("2026-02-10", 0, 0)];
    const r = aggregateSeriesByGranularity(comZero, "day");
    // Zero é informação: o investimento continuou correndo. Sumir com o ponto
    // faria a linha ficar mais curta que as barras.
    expect(r).toHaveLength(4);
    expect(r[3]!.salesCount).toBe(0);
  });
});
