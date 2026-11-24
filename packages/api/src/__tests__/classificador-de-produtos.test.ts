import { describe, expect, it } from "vitest";
import { classificadorDeProdutos } from "../utils/order-bump.js";

/**
 * Story 41.13 — a resolução `produto → papel` saiu de dentro da rota para poder
 * ser a MESMA no card e na réplica diária. O que o teste trava:
 * `temClassificacao` é o que autoriza confiar no produto da linha, e a
 * precedência (mapa > lista antiga > default da etapa) não pode inverter.
 */
describe("classificadorDeProdutos", () => {
  it("etapa sem nada classificado não autoriza confiar no produto", () => {
    const c = classificadorDeProdutos([{ orderBumpProducts: [], productTypes: null }], "sales");
    expect(c.temClassificacao).toBe(false);
    // o default da etapa de Vendas segue sendo `principal` (18.70)
    expect(c.tipoDoProduto("Mentoria")).toBe("principal");
  });

  it("o mapa manda, e casa sem ligar para caixa nem espaço nas pontas", () => {
    const c = classificadorDeProdutos(
      [{ orderBumpProducts: ["Gravação"], productTypes: { "gravação": "combo" } }],
      "paid",
    );
    expect(c.temClassificacao).toBe(true);
    expect(c.tipoDoProduto("  GRAVAÇÃO ")).toBe("combo");
  });

  it("sem mapa, a lista antiga de bumps vale — e o resto é o default da etapa", () => {
    const c = classificadorDeProdutos([{ orderBumpProducts: ["GPT para Negócios"], productTypes: null }], "paid");
    expect(c.temClassificacao).toBe(true);
    expect(c.tipoDoProduto("gpt para negócios")).toBe("order_bump");
    expect(c.tipoDoProduto("Imersão")).toBe("ingresso");
  });

  it("junta a classificação de TODAS as planilhas da etapa", () => {
    const c = classificadorDeProdutos(
      [
        { orderBumpProducts: [], productTypes: { "curso a": "principal" } },
        { orderBumpProducts: [], productTypes: { "curso b": "upsell" } },
      ],
      "sales",
    );
    expect(c.tipoDoProduto("curso a")).toBe("principal");
    expect(c.tipoDoProduto("curso b")).toBe("upsell");
  });

  it("produto vazio não vira classificação", () => {
    const c = classificadorDeProdutos([{ orderBumpProducts: ["  "], productTypes: { "  ": "combo" } }], "sales");
    expect(c.temClassificacao).toBe(false);
  });
});
