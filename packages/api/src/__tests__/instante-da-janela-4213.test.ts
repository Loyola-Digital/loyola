/**
 * Story 42.13 (AC4/AC6d) — `instanteDoInicioDaJanela`: 00:00 do primeiro dia da
 * janela no fuso do negócio, como instante.
 *
 * O `TZ` do processo é fixado em UTC (o do runner de produção): o teste de data
 * que só fixa o relógio protege no fuso de quem roda e não no do servidor.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inicioDaJanela, instanteDoInicioDaJanela } from "../utils/sale-date.js";

let tzAnterior: string | undefined;
beforeAll(() => {
  tzAnterior = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzAnterior === undefined) delete process.env.TZ;
  else process.env.TZ = tzAnterior;
});

describe("instanteDoInicioDaJanela", () => {
  it("days = 5 em 13/10 14:17 de SP → 09/10 00:00 de SP (03:00Z), a mesma janela de dateRangeFromDays", () => {
    expect(instanteDoInicioDaJanela(5, new Date("2026-10-13T17:17:00Z")).toISOString()).toBe("2026-10-09T03:00:00.000Z");
  });
  it("days = 1 → hoje 00:00 de SP", () => {
    expect(instanteDoInicioDaJanela(1, new Date("2026-10-13T17:17:00Z")).toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });
  it("às 23:30 de SP o dia em UTC já virou, mas a janela segue o dia de SP", () => {
    // 13/10 23:30 de SP = 14/10 02:30Z
    const agora = new Date("2026-10-14T02:30:00Z");
    expect(instanteDoInicioDaJanela(1, agora).toISOString()).toBe("2026-10-13T03:00:00.000Z");
    expect(instanteDoInicioDaJanela(5, agora).toISOString()).toBe("2026-10-09T03:00:00.000Z");
  });
  it("o dia do instante, lido em SP, é exatamente inicioDaJanela", () => {
    const agora = new Date("2026-10-13T17:17:00Z");
    for (const dias of [1, 5, 7, 28, 90, 365]) {
      const instante = instanteDoInicioDaJanela(dias, agora);
      const diaEmSp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante);
      expect(diaEmSp).toBe(inicioDaJanela(dias, "2026-10-13"));
      expect(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instante)).toBe("00:00");
    }
  });
  it("lê o deslocamento do dia: em 2018, com horário de verão (UTC−2), 00:00 de SP era 02:00Z", () => {
    expect(instanteDoInicioDaJanela(1, new Date("2018-12-10T15:00:00Z")).toISOString()).toBe("2018-12-10T02:00:00.000Z");
  });
});

describe("o fio — as três rotas do RevenueCat usam a régua (AC4a/b)", () => {
  const rotas = readFileSync(fileURLToPath(new URL("../routes/revenuecat.ts", import.meta.url)), "utf8");
  it("`/sales`, `/jornada` e `/vendas-por-canal` cortam por instanteDoInicioDaJanela; nenhum `days × 24 h` sobra", () => {
    expect(rotas).not.toMatch(/days \* 86_400_000/);
    const sales = rotas.slice(rotas.indexOf('"/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/sales"'));
    expect(sales.slice(0, sales.indexOf("gte(revenuecatSales.purchasedAt, cutoff)"))).toMatch(/const cutoff = instanteDoInicioDaJanela\(query\.data\.days\);/);
    // Story 42.14: `metricas-derivadas` (AC2b) e `pagantes-por-canal` (AC6) usam a MESMA régua — 4ª e 5ª.
    expect(rotas.match(/instanteDoInicioDaJanela\(query\.data\.days\)/g)).toHaveLength(5);
    const pagantes = rotas.slice(rotas.indexOf('"/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/pagantes-por-canal"'));
    expect(pagantes.slice(0, pagantes.indexOf("consultaDePagantesPorCanal("))).toMatch(/const desde = instanteDoInicioDaJanela\(query\.data\.days\);/);
    const derivadas = rotas.slice(rotas.indexOf('"/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/metricas-derivadas"'));
    expect(derivadas).toMatch(/const desde = query\.data\.days != null \? instanteDoInicioDaJanela\(query\.data\.days\) : null;/);
    // QA TEST-002/Q16: a janela é fechada no início (>=), não aberta.
    expect(sales).toMatch(/gte\(revenuecatSales\.purchasedAt, cutoff\)/);
  });
  it("o diário de `/sales` agrupa pelo dia de SP", () => {
    expect(rotas).toMatch(/day: diaNoFusoDoNegocio\(revenuecatSales\.purchasedAt\),/);
    expect(rotas).not.toMatch(/at time zone 'UTC'/);
  });
});
