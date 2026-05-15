import { describe, it, expect } from "vitest";
import { resolveStagePhaseSuffix } from "../services/stage-phase";

describe("resolveStagePhaseSuffix", () => {
  it("launch + free + captação → leads", () => {
    expect(resolveStagePhaseSuffix("launch", "free", "Captação Gratuita")).toBe("leads");
    expect(resolveStagePhaseSuffix("launch", "free", "captura de leads")).toBe("leads");
    expect(resolveStagePhaseSuffix("launch", "free", "Leads")).toBe("leads");
  });

  it("launch + paid + captação → vendas-captacao", () => {
    expect(resolveStagePhaseSuffix("launch", "paid", "Captação Paga")).toBe("vendas-captacao");
    expect(resolveStagePhaseSuffix("launch", "paid", "captura paga")).toBe("vendas-captacao");
  });

  it("launch + qualquer + principal/vendas/produto → vendas-principal", () => {
    expect(resolveStagePhaseSuffix("launch", "paid", "Venda Principal")).toBe("vendas-principal");
    expect(resolveStagePhaseSuffix("launch", "free", "Vendas do Produto Principal")).toBe("vendas-principal");
    expect(resolveStagePhaseSuffix("launch", "sales", "Vendas")).toBe("vendas-principal");
  });

  it("launch + sales (sem nome conclusivo) → vendas-principal", () => {
    expect(resolveStagePhaseSuffix("launch", "sales", "Etapa de Saída")).toBe("vendas-principal");
  });

  it("launch + cpl → null (qualquer nome)", () => {
    expect(resolveStagePhaseSuffix("launch", "cpl", "CPL Aula 1")).toBeNull();
    expect(resolveStagePhaseSuffix("launch", "cpl", "Captação")).toBeNull();
  });

  it("perpetual + qualquer → null", () => {
    expect(resolveStagePhaseSuffix("perpetual", "paid", "Captação Paga")).toBeNull();
    expect(resolveStagePhaseSuffix("perpetual", "sales", "Vendas")).toBeNull();
    expect(resolveStagePhaseSuffix("perpetual", "free", "Leads")).toBeNull();
  });

  it("launch + nome ambíguo → null", () => {
    expect(resolveStagePhaseSuffix("launch", "free", "Etapa 1")).toBeNull();
    expect(resolveStagePhaseSuffix("launch", "paid", "Estranha")).toBeNull();
  });

  it("case-insensitive", () => {
    expect(resolveStagePhaseSuffix("launch", "free", "CAPTAÇÃO")).toBe("leads");
    expect(resolveStagePhaseSuffix("launch", "paid", "VENDA PRINCIPAL")).toBe("vendas-principal");
  });
});
