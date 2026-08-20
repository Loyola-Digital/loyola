// Story 29.49 (AC5, web) — chave canônica, resumo e agrupamento por tipo.
import { describe, it, expect } from "vitest";
import {
  productKey,
  contarPorTipo,
  agruparPorTipo,
  legendaQuebraPorTipo,
  TIPO_PADRAO,
} from "@/lib/utils/perpetual-product-types";

describe("productKey", () => {
  // A mesma regra do backend. Se as duas divergirem, o gestor classifica e a
  // classificacao nao "pega" — sem erro em lugar nenhum.
  it("normaliza espaco e caixa", () => {
    expect(productKey("  Combo De Facas ")).toBe("combo de facas");
    expect(productKey("IMERSÃO")).toBe(productKey("imersão"));
  });
});

describe("contarPorTipo", () => {
  it("conta os tres tipos", () => {
    expect(contarPorTipo(["principal", "order_bump", "order_bump", "upsell"])).toEqual({
      principal: 1,
      order_bump: 2,
      upsell: 1,
    });
  });

  it("undefined conta como principal — e o default, nao um quarto estado", () => {
    expect(contarPorTipo([undefined, undefined, "upsell"])).toEqual({
      principal: 2,
      order_bump: 0,
      upsell: 1,
    });
  });

  it("lista vazia devolve os tres zerados, nao objeto vazio", () => {
    expect(contarPorTipo([])).toEqual({ principal: 0, order_bump: 0, upsell: 0 });
  });
});

describe("agruparPorTipo", () => {
  it("separa preservando a grafia original e a ordem recebida", () => {
    const out = agruparPorTipo([
      { name: "Workshop do Netão", type: "principal" },
      { name: "Combo de Facas", type: "order_bump" },
      { name: "E-book Cortes", type: "order_bump" },
      { name: "Mentoria Pro", type: "upsell" },
    ]);
    expect(out.principal).toEqual(["Workshop do Netão"]);
    expect(out.order_bump).toEqual(["Combo de Facas", "E-book Cortes"]);
    expect(out.upsell).toEqual(["Mentoria Pro"]);
  });

  it("sem produtos, os tres grupos existem vazios (a 29.50 itera sobre eles)", () => {
    expect(agruparPorTipo([])).toEqual({ principal: [], order_bump: [], upsell: [] });
  });

  it("o default e principal", () => {
    expect(TIPO_PADRAO).toBe("principal");
  });
});

// Story 29.53 (AC3) — a legenda da quebra sob o card de Vendas.
describe("legendaQuebraPorTipo", () => {
  it("monta a linha do AC: Principal 109 · Order Bump 20", () => {
    const out = legendaQuebraPorTipo({ principal: 109, order_bump: 20, upsell: 0 }, 110);
    expect(out?.texto).toBe("Principal 109 · Order Bump 20");
  });

  it("o titulo diz por que as fatias nao somam o card", () => {
    const out = legendaQuebraPorTipo({ principal: 109, order_bump: 20, upsell: 0 }, 110);
    // 129 linhas contra 110 compradores — quem somar 109 + 20 e esperar 110
    // esta fazendo a pergunta errada, e a explicacao precisa estar na tela.
    expect(out?.titulo).toContain("129 linhas pagas");
    expect(out?.titulo).toContain("110 compradores");
  });

  it("mostra o upsell quando existe, e o oculta quando e zero", () => {
    expect(legendaQuebraPorTipo({ principal: 5, order_bump: 2, upsell: 1 }, 5)?.texto).toBe(
      "Principal 5 · Order Bump 2 · Upsell 1",
    );
    expect(legendaQuebraPorTipo({ principal: 5, order_bump: 2, upsell: 0 }, 5)?.texto).toBe(
      "Principal 5 · Order Bump 2",
    );
  });

  it("sem classificacao, nao ha legenda — o card fica como antes da story", () => {
    expect(legendaQuebraPorTipo(null, 110)).toBeNull();
    expect(legendaQuebraPorTipo(undefined, 110)).toBeNull();
  });

  it("tudo principal e ausencia de informacao, nao informacao", () => {
    // O gestor ainda nao classificou nada. Exibir "Principal 129" sugeriria que
    // alguem conferiu e nao ha bump — que e outra afirmacao.
    expect(legendaQuebraPorTipo({ principal: 129, order_bump: 0, upsell: 0 }, 110)).toBeNull();
  });
});
