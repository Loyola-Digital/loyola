import { describe, expect, it } from "vitest";
import {
  declararJanela,
  fraseDoFiltro,
  hojeNoNegocio,
  intervaloDaJanela,
  tituloDoResumo,
  ultimosNDias,
} from "../janela-dos-cards-lyrio";

/**
 * Story 42.14 (AC2a, AC3, AC9a) — o vocabulário único de janela dos dois blocos.
 * Datas fixas: "hoje" entra como argumento (16/10/2026, o dia do pedido).
 */
const HOJE = "2026-10-16";
const ctx = (p: Partial<{ diasDoFiltro: number; hoje: string; serieDesde: string | null }> = {}) => ({
  diasDoFiltro: 90,
  hoje: HOJE,
  serieDesde: null,
  ...p,
});

describe("tituloDoResumo (AC3b)", () => {
  it("o exemplo da story: 90 dias em 16/10 → 19/07 a 16/10 (16/10 − 89)", () => {
    expect(tituloDoResumo(90, HOJE)).toBe("Resumo mobile · últimos 90 dias (19/07 a 16/10)");
  });
  it("N e datas dinâmicos: 28 dias → 19/09 a 16/10; 7 dias → 10/10 a 16/10", () => {
    expect(tituloDoResumo(28, HOJE)).toBe("Resumo mobile · últimos 28 dias (19/09 a 16/10)");
    expect(tituloDoResumo(7, HOJE)).toBe("Resumo mobile · últimos 7 dias (10/10 a 16/10)");
  });
  it("1 dia é só hoje — N dias incluem hoje, não N + 1", () => {
    expect(tituloDoResumo(1, HOJE)).toBe("Resumo mobile · último dia (16/10 a 16/10)");
    expect(intervaloDaJanela(1, HOJE)).toBe("16/10 a 16/10");
  });
  it("a virada de ano não quebra a aritmética de calendário", () => {
    expect(intervaloDaJanela(7, "2027-01-03")).toBe("28/12 a 03/01");
  });
});

describe("declararJanela — as quatro naturezas (AC1a, AC3a, AC3c)", () => {
  it("agora: etiqueta `agora`, âmbar, 'não segue o filtro de N dias', sem datas", () => {
    const d = declararJanela({ tipo: "agora" }, ctx());
    expect(d).toMatchObject({ etiqueta: "agora", segueOFiltro: false, destaque: true, frase: "não segue o filtro de 90 dias" });
    expect(d.periodo).toContain("retrato");
    expect(d.periodo).toMatch(/não segue o filtro de 90 dias$/);
    expect(d.periodo).not.toMatch(/\d{2}\/\d{2}/);
  });

  it("filtro com a janela inteira coberta: `últimos N dias`, sem âmbar, com as datas e 'segue o filtro'", () => {
    const d = declararJanela({ tipo: "filtro" }, ctx({ diasDoFiltro: 28, serieDesde: "2026-08-10" }));
    expect(d).toMatchObject({ etiqueta: "últimos 28 dias", segueOFiltro: true, destaque: false, frase: "segue o filtro de 28 dias" });
    expect(d.periodo).toBe("últimos 28 dias (19/09 a 16/10) · segue o filtro de 28 dias");
  });

  it("filtro que começa antes da série: `desde 10/08` (a janela efetiva) e o memorial explica a cobertura", () => {
    const d = declararJanela({ tipo: "filtro" }, ctx({ serieDesde: "2026-08-10" }));
    expect(d.etiqueta).toBe("desde 10/08");
    expect(d.destaque).toBe(false);
    expect(d.periodo).toContain("últimos 90 dias (19/07 a 16/10)");
    expect(d.periodo).toContain("só existe desde 10/08");
    expect(d.periodo).toContain("10/08 a 16/10");
    expect(d.periodo).toMatch(/segue o filtro de 90 dias$/);
  });

  it("a etiqueta `desde` vem da série da API, não de uma data fixa no código (AC2a)", () => {
    expect(declararJanela({ tipo: "filtro" }, ctx({ serieDesde: "2026-09-01" })).etiqueta).toBe("desde 01/09");
  });

  it("série começando NO primeiro dia da janela: a janela está coberta (`últimos N dias`)", () => {
    expect(declararJanela({ tipo: "filtro" }, ctx({ diasDoFiltro: 90, serieDesde: "2026-07-19" })).etiqueta).toBe("últimos 90 dias");
    expect(declararJanela({ tipo: "filtro" }, ctx({ diasDoFiltro: 90, serieDesde: "2026-07-20" })).etiqueta).toBe("desde 20/07");
  });

  it("CAC de 28 dias fixos (régua nossa): `28d fixo`, âmbar, com as datas de SP", () => {
    const d = declararJanela({ tipo: "fixa", dias: 28, origem: "regua" }, ctx());
    expect(d).toMatchObject({ etiqueta: "28d fixo", segueOFiltro: false, destaque: true });
    expect(d.periodo).toBe("últimos 28 dias (19/09 a 16/10), janela fixa · não segue o filtro de 90 dias");
  });

  it("28 dias contados pelo RevenueCat: âmbar e SEM datas — a janela da API não foi verificada (AC1c, P8)", () => {
    const d = declararJanela({ tipo: "fixa", dias: 28, origem: "revenuecat" }, ctx());
    expect(d).toMatchObject({ etiqueta: "últimos 28 dias", destaque: true, segueOFiltro: false });
    expect(d.periodo).toContain("UTC");
    expect(d.periodo).not.toMatch(/\d{2}\/\d{2}/);
  });

  it("série inteira (API anterior à 42.14): âmbar, `desde o início da série`", () => {
    const d = declararJanela({ tipo: "serie" }, ctx({ serieDesde: "2026-08-10" }));
    expect(d).toMatchObject({ etiqueta: "desde o início da série", destaque: true });
    expect(d.periodo).toContain("(10/08)");
  });

  it("quem segue nunca tem âmbar; quem não segue sempre tem (PO-D2)", () => {
    const janelas = [{ tipo: "agora" }, { tipo: "filtro" }, { tipo: "serie" }, { tipo: "fixa", dias: 28, origem: "regua" }, { tipo: "fixa", dias: 28, origem: "revenuecat" }] as const;
    for (const j of janelas) {
      const d = declararJanela(j, ctx({ serieDesde: "2026-08-10" }));
      expect(d.destaque).toBe(!d.segueOFiltro);
      expect(d.periodo.endsWith(d.frase)).toBe(true);
    }
  });
});

describe("textos auxiliares", () => {
  it("frase e plural", () => {
    expect(fraseDoFiltro(true, 1)).toBe("segue o filtro de 1 dia");
    expect(fraseDoFiltro(false, 365)).toBe("não segue o filtro de 365 dias");
    expect(ultimosNDias(1)).toBe("último dia");
    expect(ultimosNDias(180)).toBe("últimos 180 dias");
  });

  it("hojeNoNegocio é o dia de SP, não o UTC: 16/10 às 23h30 de SP já é 17/10 em UTC", () => {
    expect(hojeNoNegocio(new Date("2026-10-17T02:30:00Z"))).toBe("2026-10-16");
    expect(hojeNoNegocio(new Date("2026-10-17T03:30:00Z"))).toBe("2026-10-17");
  });
});
