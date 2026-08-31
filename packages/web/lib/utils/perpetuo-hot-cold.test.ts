/**
 * A projeção dos públicos do Perpétuo nos baldes do donut.
 *
 * O que estes testes protegem é a decisão de NÃO reclassificar: a temperatura
 * vem do backend, e aqui só se muda a forma. Um teste que reimplementasse a
 * regra esconderia justamente o risco de as duas divergirem.
 */

import { describe, expect, it } from "vitest";
import {
  agregarCompradores,
  agregarReceita,
  receitaDoPublico,
  temTemperatura,
  type PublicoDoPerpetuo,
} from "./perpetuo-hot-cold";

const p = (over: Partial<PublicoDoPerpetuo> = {}): PublicoDoPerpetuo => ({
  publico: "Pago quente",
  compradores: 10,
  receitaPrincipal: 1000,
  receitaBump: 200,
  receitaUpsell: 100,
  aovComBump: 130,
  ...over,
});

describe("os cinco baldes viram três", () => {
  it("quente e frio vão para hot e cold", () => {
    const agg = agregarCompradores([
      p({ publico: "Pago quente", compradores: 30 }),
      p({ publico: "Pago frio", compradores: 20 }),
    ])!;
    expect(agg.hot).toBe(30);
    expect(agg.cold).toBe(20);
    expect(agg.total).toBe(50);
  });

  it("orgânico, pago indefinido e sem track somam em Outros", () => {
    const agg = agregarCompradores([
      p({ publico: "Orgânico", compradores: 5 }),
      p({ publico: "Pago indefinido", compradores: 3 }),
      p({ publico: "Sem Track", compradores: 2 }),
    ])!;
    expect(agg.outros).toBe(10);
    expect(agg.hot).toBe(0);
  });

  it("a legenda de Outros diz DE QUE ele é feito", () => {
    // "Outros: 10" sozinho esconderia que ali dentro mora o público de maior
    // AOV medido no funil do Netão.
    const agg = agregarCompradores([
      p({ publico: "Orgânico", compradores: 5 }),
      p({ publico: "Sem Track", compradores: 2 }),
    ])!;
    expect(agg.items.outros).toEqual(["Orgânico (5)", "Sem Track (2)"]);
  });

  it("público com zero compradores não entra na legenda", () => {
    const agg = agregarCompradores([
      p({ publico: "Pago quente", compradores: 10 }),
      p({ publico: "Pago frio", compradores: 0 }),
    ])!;
    expect(agg.items.cold).toEqual([]);
    expect(agg.cold).toBe(0);
  });
});

describe("sem amostra não se desenha", () => {
  it("lista vazia devolve null, não um donut de zeros", () => {
    expect(agregarCompradores([])).toBeNull();
  });

  it("todos com zero compradores também devolve null", () => {
    // Um donut de zeros afirma uma distribuição que não foi medida.
    expect(agregarCompradores([p({ compradores: 0 })])).toBeNull();
  });
});

describe("receita é outra pergunta", () => {
  it("soma principal, bump e upsell", () => {
    expect(receitaDoPublico(p())).toBe(1300);
  });

  it("quem traz mais gente nem sempre traz mais dinheiro", () => {
    // O caso real: Sem Track tinha o dobro do AOV dos demais no Perpétuo.
    const publicos = [
      p({ publico: "Pago quente", compradores: 100, receitaPrincipal: 1000, receitaBump: 0, receitaUpsell: 0 }),
      p({ publico: "Sem Track", compradores: 10, receitaPrincipal: 2000, receitaBump: 0, receitaUpsell: 0 }),
    ];
    const porGente = agregarCompradores(publicos)!;
    const porGrana = agregarReceita(publicos)!;

    expect(porGente.hot).toBeGreaterThan(porGente.outros);
    expect(porGrana.hot).toBeLessThan(porGrana.outros);
  });

  it("a legenda da receita sai em reais", () => {
    const agg = agregarReceita([
      p({ publico: "Pago frio", receitaPrincipal: 1500, receitaBump: 0, receitaUpsell: 0 }),
    ])!;
    expect(agg.items.cold[0]).toMatch(/R\$/);
  });
});

describe("quando a temperatura não existe", () => {
  it("funil sem utm_term preenchido é detectado", () => {
    // 100% em "Outros" não é informação: é a ausência dela, e a tela precisa
    // dizer isso com palavras em vez de desenhar um donut cinza.
    expect(temTemperatura([p({ publico: "Orgânico" }), p({ publico: "Sem Track" })])).toBe(false);
  });

  it("um único público pago com temperatura já conta", () => {
    expect(temTemperatura([p({ publico: "Pago frio", compradores: 1 })])).toBe(true);
  });

  it("público quente com zero compradores não conta", () => {
    expect(temTemperatura([p({ publico: "Pago quente", compradores: 0 })])).toBe(false);
  });
});
