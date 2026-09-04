/**
 * Story 29.74 (AC2/AC3/AC5) — a legenda do card de Faturamento Bruto.
 *
 * O que estes casos protegem é a diferença entre as duas legendas que passam a
 * conviver na mesma tela: a de Vendas conta LINHAS e não fecha com o card; esta
 * soma REAIS e fecha. Quem lê vai tentar somar as duas.
 */
import {
  legendaFaturamentoPorTipo,
  legendaQuebraPorTipo,
} from "@/lib/utils/perpetual-product-types";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Os números do BBE a1, medidos em produção em 2026-09-04. */
const BBE = { ingresso: 0, principal: 49915, order_bump: 7634, combo: 0, upsell: 0 };
const BBE_TOTAL = 57549;

describe("legendaFaturamentoPorTipo", () => {
  it("as fatias somam o Faturamento Bruto do card", () => {
    // O AC inteiro em uma linha: valor é aditivo, então a soma tem que fechar.
    // A contagem de linhas (card de Vendas) não fecha — e é por isso que as
    // duas legendas precisam de textos diferentes.
    expect(BBE.principal + BBE.order_bump).toBe(BBE_TOTAL);
  });

  it("imprime as duas parcelas com o rótulo que o gestor pediu", () => {
    const l = legendaFaturamentoPorTipo(BBE, BBE_TOTAL, brl)!;
    expect(l.texto).toContain("Faturamento Principal");
    expect(l.texto).toContain("Faturamento Order Bump");
    expect(l.texto).toContain(brl(49915));
    expect(l.texto).toContain(brl(7634));
    expect(l.texto).toContain("·");
  });

  it("o título diz que as fatias FECHAM — e avisa da outra legenda", () => {
    const l = legendaFaturamentoPorTipo(BBE, BBE_TOTAL, brl)!;
    expect(l.titulo).toContain("somam");
    expect(l.titulo).toContain(brl(BBE_TOTAL));
    // Sem este aviso, o leitor compara com a quebra de Vendas logo ao lado e
    // conclui que uma das duas está errada.
    expect(l.titulo).toContain("LINHAS");
  });

  it("some quando não há classificação (AC5)", () => {
    // `fz-a1` e `bbe-fc1-a2`: o backend manda `null` e a legenda não aparece.
    expect(legendaFaturamentoPorTipo(null, 90915, brl)).toBeNull();
    expect(legendaFaturamentoPorTipo(undefined, 90915, brl)).toBeNull();
  });

  it("some quando tudo é principal — isso é ausência de informação", () => {
    const so = { ingresso: 0, principal: 90915, order_bump: 0, combo: 0, upsell: 0 };
    expect(legendaFaturamentoPorTipo(so, 90915, brl)).toBeNull();
  });

  it("combo e upsell entram quando existem", () => {
    const q = { ingresso: 0, principal: 100, order_bump: 20, combo: 50, upsell: 30 };
    const l = legendaFaturamentoPorTipo(q, 200, brl)!;
    expect(l.texto).toContain("Faturamento Combo");
    expect(l.texto).toContain("Faturamento Upsell");
  });

  it("NÃO é a mesma legenda da de Vendas — os títulos dizem coisas opostas", () => {
    const contagem = { principal: 109, order_bump: 20, combo: 0, upsell: 0 };
    const lVendas = legendaQuebraPorTipo(contagem, 110)!;
    const lFat = legendaFaturamentoPorTipo(BBE, BBE_TOTAL, brl)!;
    expect(lVendas.titulo).toContain("não somam");
    expect(lFat.titulo).toContain("somam o Faturamento Bruto");
  });
});
