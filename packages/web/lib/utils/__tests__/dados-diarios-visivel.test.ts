// Story 18.86 — a tabela "Dados diários" na Captação Paga sem planilha de leads (AC1, AC3, AC4).
import { describe, expect, it } from "vitest";
import { deveMostrarDadosDiarios } from "../dados-diarios-visivel";

describe("deveMostrarDadosDiarios", () => {
  it("AC1: Paga com vendas e SEM planilha de leads mostra a tabela (caso dgpg05-out-26)", () => {
    expect(
      deveMostrarDadosDiarios({ ehPaga: true, temPlanilhaDeLeads: false, temVendas: true, qtdDias: 4 }),
    ).toBe(true);
  });

  it("AC3: Paga com planilha de leads continua mostrando, com ou sem vendas", () => {
    expect(
      deveMostrarDadosDiarios({ ehPaga: true, temPlanilhaDeLeads: true, temVendas: true, qtdDias: 4 }),
    ).toBe(true);
    expect(
      deveMostrarDadosDiarios({ ehPaga: true, temPlanilhaDeLeads: true, temVendas: false, qtdDias: 4 }),
    ).toBe(true);
  });

  it("AC3: Gratuita sem planilha de leads continua oculta, mesmo com vendas", () => {
    expect(
      deveMostrarDadosDiarios({ ehPaga: false, temPlanilhaDeLeads: false, temVendas: true, qtdDias: 4 }),
    ).toBe(false);
  });

  it("AC3: Paga sem planilha de leads e sem vendas continua oculta", () => {
    expect(
      deveMostrarDadosDiarios({ ehPaga: true, temPlanilhaDeLeads: false, temVendas: false, qtdDias: 4 }),
    ).toBe(false);
  });

  it("AC3: sem nenhum dia a tabela fica oculta em qualquer etapa", () => {
    for (const ehPaga of [true, false]) {
      for (const temPlanilhaDeLeads of [true, false]) {
        for (const temVendas of [true, false]) {
          expect(
            deveMostrarDadosDiarios({ ehPaga, temPlanilhaDeLeads, temVendas, qtdDias: 0 }),
          ).toBe(false);
        }
      }
    }
  });

  it("Gratuita com planilha de leads segue como antes", () => {
    expect(
      deveMostrarDadosDiarios({ ehPaga: false, temPlanilhaDeLeads: true, temVendas: false, qtdDias: 4 }),
    ).toBe(true);
  });
});
