import { describe, it, expect } from "vitest";
import { diaDaColeta, paraObjetoDeMetricas } from "../services/revenuecat-snapshot.js";

describe("diaDaColeta", () => {
  it("devolve o dia LOCAL em YYYY-MM-DD", () => {
    // Local, não UTC: a coleta roda às 4h da manhã do servidor, e usar UTC
    // jogaria o ponto para o dia anterior em fuso negativo — a série ficaria
    // com dois pontos num dia e nenhum no outro.
    const d = new Date(2026, 7, 25, 4, 0, 0);
    expect(diaDaColeta(d)).toBe("2026-08-25");
  });

  it("mês e dia recebem zero à esquerda", () => {
    expect(diaDaColeta(new Date(2026, 0, 5, 4, 0, 0))).toBe("2026-01-05");
  });
});

describe("paraObjetoDeMetricas", () => {
  /** O que a API devolveu em produção em 2026-08-25. */
  const REAIS = [
    { id: "active_trials", value: 95, unit: "#" },
    { id: "active_subscriptions", value: 345, unit: "#" },
    { id: "mrr", value: 596, unit: "$" },
    { id: "revenue", value: 2318, unit: "$" },
    { id: "new_customers", value: 9719, unit: "#" },
    { id: "active_users", value: 11186, unit: "#" },
  ];

  it("indexa por id", () => {
    const o = paraObjetoDeMetricas(REAIS);
    expect(o.mrr.value).toBe(596);
    expect(o.active_subscriptions.value).toBe(345);
  });

  it("guarda a UNIDADE junto do valor", () => {
    // `mrr` e `revenue` vêm em dólar. Uma série sem unidade seria lida como
    // real por quem a consumir daqui a meses — erro de ~5x, e sem como saber.
    const o = paraObjetoDeMetricas(REAIS);
    expect(o.mrr.unit).toBe("$");
    expect(o.active_trials.unit).toBe("#");
  });

  it("uma métrica nova entra sem mudar nada (AC2)", () => {
    const o = paraObjetoDeMetricas([...REAIS, { id: "metrica_futura", value: 7, unit: "#" }]);
    expect(o.metrica_futura.value).toBe(7);
    expect(Object.keys(o)).toHaveLength(7);
  });

  it("lista vazia devolve objeto vazio — o chamador decide o que fazer", () => {
    // O serviço trata isso como FALHA e não grava: resposta vazia é leitura
    // quebrada disfarçada, não um dia sem dado. Num histórico, um zero gravado
    // hoje é indistinguível de um zero verdadeiro daqui a seis meses.
    expect(paraObjetoDeMetricas([])).toEqual({});
  });
});
