import { describe, expect, it } from "vitest";
import { ABAS_DO_PLANEJAMENTO, planejamentoHref, temPainelDePlanejamento } from "@/lib/utils/planejamento-entrada";

/** Story 48.7 — AC3. */

describe("temPainelDePlanejamento", () => {
  it("só funil de lançamento", () => {
    expect(temPainelDePlanejamento("launch")).toBe(true);
    expect(temPainelDePlanejamento("perpetual")).toBe(false);
    expect(temPainelDePlanejamento("mobile")).toBe(false);
    expect(temPainelDePlanejamento(null)).toBe(false);
    expect(temPainelDePlanejamento(undefined)).toBe(false);
    expect(temPainelDePlanejamento("")).toBe(false);
  });

  it("não normaliza caixa nem espaço — o tipo vem da API tal e qual", () => {
    expect(temPainelDePlanejamento("Launch")).toBe(false);
    expect(temPainelDePlanejamento(" launch")).toBe(false);
  });
});

describe("planejamentoHref", () => {
  const P = "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3";
  const F = "66aa4c1f-c8dc-4d87-b402-0a74fc8243d7";

  it("é sub-página do FUNIL — e NÃO tem `stages/` no caminho (o 404 de 22/09)", () => {
    const href = planejamentoHref(P, F);
    expect(href).toBe(`/projects/${P}/funnels/${F}/planejamento`);
    expect(href).not.toContain("/stages/");
    expect(href.split("/").filter(Boolean)).toEqual(["projects", P, "funnels", F, "planejamento"]);
  });

  it("aceita as quatro abas como `?tab=`", () => {
    expect(ABAS_DO_PLANEJAMENTO).toEqual(["inputs", "organicos", "pagos", "resumo"]);
    for (const aba of ABAS_DO_PLANEJAMENTO) {
      expect(planejamentoHref(P, F, aba)).toBe(`/projects/${P}/funnels/${F}/planejamento?tab=${aba}`);
    }
  });

  it("sem aba, não gera query string vazia", () => {
    expect(planejamentoHref(P, F)).not.toContain("?");
  });
});
