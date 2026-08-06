import { describe, it, expect } from "vitest";
import { janelaDaAba } from "../mvp-window";

describe("janelaDaAba — Story 29.41 (AC6)", () => {
  const hoje = new Date("2026-08-06T14:30:00");

  it("preset de 30 dias vira janela explícita", () => {
    expect(janelaDaAba(30, undefined, hoje)).toEqual({
      startDate: "2026-07-07",
      endDate: "2026-08-06",
    });
  });

  it("replica a aritmética do servidor (hoje − N dias)", () => {
    // perpetual-sales-data.ts:241-242 faz `new Date()` e subtrai N dias.
    // Divergir daqui faria a cadeia medir uma janela e o resto da aba, outra.
    expect(janelaDaAba(7, undefined, hoje).startDate).toBe("2026-07-30");
    expect(janelaDaAba(1, undefined, hoje).startDate).toBe("2026-08-05");
  });

  it("range custom tem precedência sobre o preset", () => {
    const r = { startDate: "2026-01-01", endDate: "2026-01-31" };
    expect(janelaDaAba(30, r, hoje)).toEqual(r);
  });

  it("range incompleto cai no preset — meia janela seria pior que nenhuma", () => {
    expect(janelaDaAba(30, { startDate: "2026-01-01", endDate: "" }, hoje).endDate).toBe("2026-08-06");
  });

  describe("data local, não UTC", () => {
    it("à noite não devolve o dia seguinte", () => {
      // toISOString() em 23:30 BRT vira 02:30 UTC do dia SEGUINTE. Usar UTC
      // aqui deslocaria a janela em um dia inteiro sem ninguém perceber.
      const noite = new Date("2026-08-06T23:30:00");
      expect(janelaDaAba(1, undefined, noite).endDate).toBe("2026-08-06");
    });

    it("de madrugada não devolve o dia anterior", () => {
      const madrugada = new Date("2026-08-06T00:15:00");
      expect(janelaDaAba(1, undefined, madrugada).endDate).toBe("2026-08-06");
    });
  });

  describe("bordas de calendário", () => {
    it("atravessa virada de mês", () => {
      expect(janelaDaAba(5, undefined, new Date("2026-03-03T10:00:00")).startDate).toBe("2026-02-26");
    });

    it("atravessa virada de ano", () => {
      expect(janelaDaAba(10, undefined, new Date("2026-01-05T10:00:00")).startDate).toBe("2025-12-26");
    });

    it("respeita ano bissexto", () => {
      // 2028 é bissexto: 1º de março menos 1 dia = 29 de fevereiro
      expect(janelaDaAba(1, undefined, new Date("2028-03-01T10:00:00")).startDate).toBe("2028-02-29");
    });
  });

  it("sempre devolve YYYY-MM-DD com zero à esquerda", () => {
    const j = janelaDaAba(30, undefined, new Date("2026-02-05T10:00:00"));
    expect(j.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.endDate).toBe("2026-02-05");
  });
});
