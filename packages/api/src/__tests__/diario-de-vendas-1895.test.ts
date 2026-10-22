/**
 * Story 18.95 — o diário da etapa de Vendas fecha com o card do topo.
 *
 * Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import {
  chaveDoDia,
  criarDiarioDeVendas,
  diarioDeVendasVazio,
} from "../utils/diario-de-vendas.js";

const dia = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);

describe("criarDiarioDeVendas", () => {
  it("separa por dia e por origem; faturamento pago só do Pago", () => {
    const d = criarDiarioDeVendas();
    d.somar(dia(2026, 10, 10), "Pago", 1000);
    d.somar(dia(2026, 10, 10, 23), "Orgânico", 500);
    d.somar(dia(2026, 10, 11), "Sem Track", 300);
    const r = d.resultado();
    expect(r.dias["2026-10-10"]).toEqual({ pago: 1, org: 1, semTrack: 0, manual: 0, faturamento: 1500, faturamentoPago: 1000 });
    expect(r.dias["2026-10-11"].semTrack).toBe(1);
    // Mutação: somar faturamento pago de toda venda → 1500 no dia 10.
    expect(r.dias["2026-10-11"].faturamentoPago).toBe(0);
  });

  it("venda sem data vai para o balde semData (AC5b)", () => {
    // Mutação: descartar a venda sem data (como o `ingressosByDay`) → o Total
    // da tabela fica R$ 700 abaixo do card.
    const d = criarDiarioDeVendas();
    d.somar(null, "Pago", 700);
    d.somar(null, "Manual", 50);
    expect(d.resultado().semData).toEqual({ pago: 1, org: 0, semTrack: 0, manual: 1, faturamento: 750, faturamentoPago: 700 });
    expect(Object.keys(d.resultado().dias)).toEqual([]);
  });

  it("manual que não conta como venda soma o dinheiro mas não a pessoa", () => {
    const d = criarDiarioDeVendas();
    d.somar(dia(2026, 10, 12), "Manual", 200, false);
    expect(d.resultado().dias["2026-10-12"]).toMatchObject({ manual: 0, faturamento: 200, faturamentoPago: 0 });
  });

  it("Σ dias + semData = totais (o que o card soma)", () => {
    const vendas: [Date | null, "Pago" | "Orgânico" | "Sem Track" | "Manual", number, boolean][] = [
      [dia(2026, 10, 1), "Pago", 997, true],
      [dia(2026, 10, 1), "Pago", 1997, true],
      [dia(2026, 10, 2), "Orgânico", 3909.09, true],
      [null, "Sem Track", 120, true],
      [dia(2026, 10, 3), "Manual", 400, false],
    ];
    const d = criarDiarioDeVendas();
    for (const [data, fonte, bruto, conta] of vendas) d.somar(data, fonte, bruto, conta);
    const r = d.resultado();
    const todos = [...Object.values(r.dias), r.semData];
    const soma = (k: keyof (typeof todos)[number]) => todos.reduce((s, x) => s + x[k], 0);
    expect(soma("faturamento")).toBeCloseTo(997 + 1997 + 3909.09 + 120 + 400, 6);
    expect(soma("faturamentoPago")).toBe(997 + 1997);
    expect(soma("pago") + soma("org") + soma("semTrack") + soma("manual")).toBe(4);
  });

  it("chave do dia = componentes locais (a mesma do ingressosByDay)", () => {
    expect(chaveDoDia(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("o vazio tem semData zerado e nenhum dia", () => {
    expect(diarioDeVendasVazio()).toEqual({
      dias: {},
      semData: { pago: 0, org: 0, semTrack: 0, manual: 0, faturamento: 0, faturamentoPago: 0 },
    });
  });
});

describe("o fio — a rota soma o diário nos mesmos pontos do card", () => {
  const rota = readFileSync(new URL("../routes/stage-sales-data.ts", import.meta.url), "utf-8");

  it("no laço das vendas contadas, junto do totalBruto", () => {
    // Mutação: tirar a chamada do laço → o diário sai vazio com o card cheio.
    const laco = rota.slice(rota.indexOf("of vendasContadas) {"), rota.indexOf("of vendasContadas) {") + 600);
    expect(laco).toMatch(/totalBruto \+= bruto;/);
    expect(laco).toMatch(/diarioDeVendas\.somar\(lastDate, classifyFonte\(utmSource\), bruto\)/);
  });

  it("nas manuais, com a regra de contar a pessoa (manualConta)", () => {
    expect(rota).toMatch(/diarioDeVendas\.somar\([^;]*"Manual", bruto, manualConta\[i\]\)/);
  });

  it("vai na resposta, e o vazio também tem diário", () => {
    expect(rota).toMatch(/diarioDeVendas: diarioDeVendas\.resultado\(\)/);
    expect(rota).toMatch(/diarioDeVendas: diarioDeVendasVazio\(\)/);
  });

  it("o contrato sobe para 56", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(56);
  });
});
