/**
 * Story 29.61 (AC7-bis) — verificação por reversão.
 *
 * O caso que motivou: no funil `dg-a1`, 2.147 linhas em produção, a coluna
 * mapeada como `utm_source` é "Origem de Checkout" e carrega a string SRC
 * inteira. `classifyOrigem` não casa nada e tudo cai em "Orgânico" — um funil
 * quase todo tráfego pago frio apareceria como 100% Orgânico.
 */
import { describe, it, expect } from "vitest";
import { diagnosticarPublico } from "../publico-confiavel";

const pago = (n: number) => ({ publico: "Pago quente", compradores: n });
const organico = (n: number) => ({ publico: "Orgânico", compradores: n });
const semTrack = (n: number) => ({ publico: "Sem Track", compradores: n });

describe("investimento sem comprador pago é classificação quebrada", () => {
  it("o caso do dg-a1: gastou e ninguém é Pago", () => {
    // Não existe funil que gasta em anúncio e vende só no orgânico.
    const d = diagnosticarPublico([organico(2000)], 50_000);
    expect(d.confiavel).toBe(false);
    if (!d.confiavel) {
      expect(d.motivo).toContain("utm_source");
      expect(d.motivo).toContain("2000");
    }
  });

  it("um único comprador Pago já basta para a dimensão informar", () => {
    // O detector não julga proporção — só a ausência TOTAL, que é o sintoma
    // inequívoco de a coluna não ser uma UTM.
    const d = diagnosticarPublico([organico(2000), pago(1)], 50_000);
    expect(d.confiavel).toBe(true);
  });

  it("qualquer balde `Pago*` conta, não só o quente", () => {
    expect(diagnosticarPublico([organico(10), { publico: "Pago indefinido", compradores: 1 }], 9_000).confiavel).toBe(true);
  });
});

describe("sem investimento, zero comprador pago é a verdade", () => {
  it("funil orgânico puro não é acusado de estar quebrado", () => {
    // Aqui "nenhum Pago" é fato, não sintoma. Acusar seria um alerta que o
    // gestor aprende a ignorar.
    expect(diagnosticarPublico([organico(500), semTrack(20)], 0).confiavel).toBe(true);
    expect(diagnosticarPublico([organico(500)], null).confiavel).toBe(true);
  });
});

describe("as ausências", () => {
  it("sem linhas não há o que afirmar nem o que desmentir", () => {
    expect(diagnosticarPublico([], 50_000).confiavel).toBe(true);
    expect(diagnosticarPublico(null, 50_000).confiavel).toBe(true);
    expect(diagnosticarPublico(undefined, 50_000).confiavel).toBe(true);
  });
});
