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
