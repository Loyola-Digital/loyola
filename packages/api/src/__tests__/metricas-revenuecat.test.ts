import { describe, it, expect } from "vitest";
import {
  calcularMetricasDerivadas,
  arrDoMrr,
  conversaoParaTrial,
  type EventoRevenuecat,
} from "../utils/metricas-revenuecat.js";

const ev = (
  eventType: string,
  periodType: string | null,
  appUserId: string,
): EventoRevenuecat => ({ eventType, periodType, appUserId, eventAt: new Date("2026-08-15T10:00:00Z") });

describe("trial e assinatura paga não se misturam (Story 42.9)", () => {
  /**
   * O caso real de produção: EXPIRATION vem 164 vezes para TRIAL e 5 para
   * NORMAL. Somar tudo daria "churn de 169" — 164 delas são pessoas que
   * largaram o teste, não clientes perdidos.
   */
  const EVENTOS = [
    ev("EXPIRATION", "TRIAL", "u1"),
    ev("EXPIRATION", "TRIAL", "u2"),
    ev("EXPIRATION", "TRIAL", "u3"),
    ev("EXPIRATION", "NORMAL", "u4"),
  ];

  it("churn conta só a saída de quem PAGAVA", () => {
    const m = calcularMetricasDerivadas(EVENTOS);
    expect(m.churnPagante).toBe(1);
  });

  it("o abandono de trial é contado à parte", () => {
    expect(calcularMetricasDerivadas(EVENTOS).abandonoDeTrial).toBe(3);
  });

  it("CANCELLATION não entra no churn — a pessoa ainda tem acesso", () => {
    // Contar cancelamento e expiração como saída conta a mesma pessoa duas
    // vezes, com semanas de distância. E existe UNCANCELLATION.
    const m = calcularMetricasDerivadas([
      ev("CANCELLATION", "NORMAL", "u9"),
      ev("CANCELLATION", "TRIAL", "u8"),
    ]);
    expect(m.churnPagante).toBe(0);
    expect(m.cancelamentosPagantes).toBe(1);
  });

  it("INTRO e PROMOTIONAL contam como pago", () => {
    // Existem em produção (7 CANCELLATION INTRO, 8 EXPIRATION PROMOTIONAL).
    // Tratá-los como trial esconderia saída de quem pagou preço promocional.
    const m = calcularMetricasDerivadas([
      ev("EXPIRATION", "INTRO", "u1"),
      ev("EXPIRATION", "PROMOTIONAL", "u2"),
    ]);
    expect(m.churnPagante).toBe(2);
    expect(m.abandonoDeTrial).toBe(0);
  });
});

describe("conversão de trial", () => {
  it("trial que depois renova como pago conta como conversão", () => {
    const eventos = [ev("INITIAL_PURCHASE", "TRIAL", "u1"), ev("INITIAL_PURCHASE", "TRIAL", "u2")];
    const sempre = [...eventos, ev("RENEWAL", "NORMAL", "u1")];
    const m = calcularMetricasDerivadas(eventos, sempre);
    expect(m.novosTrials).toBe(2);
    expect(m.conversoesDeTrial).toBe(1);
    expect(m.taxaDeConversaoDeTrial).toBeCloseTo(0.5, 5);
  });

  it("a conversão é buscada na série COMPLETA, não só na janela", () => {
    // Um trial iniciado no fim do período converte depois. Olhando só a janela,
    // ele contaria como não convertido para sempre.
    const janela = [ev("INITIAL_PURCHASE", "TRIAL", "u1")];
    const sempre = [...janela, ev("RENEWAL", "NORMAL", "u1")];
    expect(calcularMetricasDerivadas(janela, janela).conversoesDeTrial).toBe(0);
    expect(calcularMetricasDerivadas(janela, sempre).conversoesDeTrial).toBe(1);
  });

  it("sem trial na janela, a taxa é null e não zero", () => {
    // Zero afirmaria que ninguém converteu; null diz que não houve o que medir.
    const m = calcularMetricasDerivadas([ev("INITIAL_PURCHASE", "NORMAL", "u1")]);
    expect(m.novosTrials).toBe(0);
    expect(m.taxaDeConversaoDeTrial).toBeNull();
  });

  it("a mesma pessoa em dois trials não conta duas vezes", () => {
    const m = calcularMetricasDerivadas([
      ev("INITIAL_PURCHASE", "TRIAL", "u1"),
      ev("INITIAL_PURCHASE", "TRIAL", "u1"),
    ]);
    expect(m.novosTrials).toBe(1);
  });
});

describe("movimento de assinaturas", () => {
  it("entradas pagas mais conversões, menos saídas consumadas", () => {
    const janela = [
      ev("INITIAL_PURCHASE", "NORMAL", "a"),
      ev("INITIAL_PURCHASE", "NORMAL", "b"),
      ev("INITIAL_PURCHASE", "TRIAL", "c"),
      ev("EXPIRATION", "NORMAL", "d"),
    ];
    const sempre = [...janela, ev("RENEWAL", "NORMAL", "c")];
    // 2 entradas + 1 conversão − 1 saída = 2
    expect(calcularMetricasDerivadas(janela, sempre).movimentoDeAssinaturas).toBe(2);
  });

  it("cancelamento não move o saldo", () => {
    const m = calcularMetricasDerivadas([
      ev("INITIAL_PURCHASE", "NORMAL", "a"),
      ev("CANCELLATION", "NORMAL", "b"),
    ]);
    expect(m.movimentoDeAssinaturas).toBe(1);
  });
});

describe("arrDoMrr (AC3)", () => {
  it("MRR × 12", () => {
    expect(arrDoMrr(596)).toBe(7152);
  });

  it("null continua null — não vira zero", () => {
    expect(arrDoMrr(null)).toBeNull();
    expect(arrDoMrr(undefined)).toBeNull();
  });

  it("zero é zero, e é diferente de não saber", () => {
    expect(arrDoMrr(0)).toBe(0);
  });
});

describe("conversaoParaTrial (AC7)", () => {
  it("os números da decisão do gestor: 182 de 11.124", () => {
    expect(conversaoParaTrial(182, 11124)!).toBeCloseTo(0.016361, 5);
  });

  it("sem Active Users, não há taxa", () => {
    expect(conversaoParaTrial(182, 0)).toBeNull();
    expect(conversaoParaTrial(182, null)).toBeNull();
  });
});
