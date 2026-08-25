/**
 * Story 18.69 — verificação por reversão do que se persiste ao salvar.
 */
import { describe, it, expect } from "vitest";
import { mapaParaPersistir, contextoDoSubtype, tiposDisponiveis, tipoPadraoDe, TIPO_PADRAO_CAPTACAO, permiteClassificarProdutos } from "../classificacao-produtos";

const PRODUTOS = [
  { name: "Imersão Super Funcionário com Claude" },
  { name: "Gravação da Imersão Super Funcionário" },
  { name: "Combo 3 em 1: Gravação + Claude" },
  { name: "Mentoria ClaudeLab | Basic e Advanced" },
];

describe("só persiste o que difere do default", () => {
  it("salvar sem classificar nada grava mapa VAZIO", () => {
    // É o caso perigoso: abrir o diálogo de uma etapa não classificada e
    // salvar. Gravar `ingresso` na Mentoria a faria ancorar checkouts de
    // captação e dobraria o denominador — R$ 447.523 em vez de R$ 216.997.
    expect(mapaParaPersistir(PRODUTOS, {})).toEqual({});
  });

  it("escolher explicitamente `ingresso` também não grava", () => {
    // O default já é esse. Gravá-lo aumenta o mapa sem acrescentar informação,
    // e faz "declarado" e "suposto" ficarem indistinguíveis depois.
    const escolhas = { "imersão super funcionário com claude": "ingresso" };
    expect(mapaParaPersistir(PRODUTOS, escolhas)).toEqual({});
  });

  it("grava o que o gestor realmente declarou", () => {
    const escolhas = {
      "gravação da imersão super funcionário": "order_bump",
      "combo 3 em 1: gravação + claude": "combo",
      "mentoria claudelab | basic e advanced": "principal",
    };
    expect(mapaParaPersistir(PRODUTOS, escolhas)).toEqual(escolhas);
  });

  it("a Mentoria classificada como `principal` PRECISA ser gravada", () => {
    // É o que a tira do denominador da captação. Sem esta linha no mapa, ela
    // volta ao default `ingresso` e ancora.
    const r = mapaParaPersistir(PRODUTOS, {
      "mentoria claudelab | basic e advanced": "principal",
    });
    expect(r["mentoria claudelab | basic e advanced"]).toBe("principal");
  });

  it("produto sem nome não vira chave vazia", () => {
    expect(mapaParaPersistir([{ name: "   " }], { "": "combo" })).toEqual({});
  });
});

// ============================================================
// Story 18.70 — o vocabulário muda entre captação e venda.
// ============================================================

describe("contextoDoSubtype", () => {
  it("`capture` é captação", () => {
    expect(contextoDoSubtype("capture")).toBe("captacao");
  });

  it("as planilhas de produto vendido são venda", () => {
    expect(contextoDoSubtype("main_product")).toBe("venda");
    expect(contextoDoSubtype("tmb")).toBe("venda");
  });
});

describe("tiposDisponiveis (AC3)", () => {
  it("na captação, os cinco papéis da 18.69", () => {
    expect(tiposDisponiveis("captacao").map((t) => t.valor)).toEqual([
      "ingresso", "order_bump", "combo", "upsell", "principal",
    ]);
  });

  it("na venda, `ingresso` não é oferecido", () => {
    // AC3: não existe ingresso numa etapa de venda; oferecê-lo convida à
    // classificação errada.
    expect(tiposDisponiveis("venda").map((t) => t.valor)).not.toContain("ingresso");
  });

  it("na venda, `principal` deixa de dizer «outra etapa»", () => {
    // O rótulo da captação existe para afastar a Mentoria do denominador. Na
    // etapa de Vendas a Mentoria É o produto da etapa — o mesmo rótulo mentiria.
    const rotulo = tiposDisponiveis("venda").find((t) => t.valor === "principal")?.rotulo;
    expect(rotulo).toBe("Produto principal");
    expect(rotulo).not.toMatch(/outra etapa/i);
  });

  it("os demais papéis continuam disponíveis na venda", () => {
    const vals = tiposDisponiveis("venda").map((t) => t.valor);
    expect(vals).toEqual(["order_bump", "combo", "upsell", "principal"]);
  });

  it("não vaza mutação entre contextos", () => {
    // As listas voltam de um filter/map sobre a mesma constante; se alguma
    // chamada devolvesse a referência original, renomear na venda renomearia
    // na captação também.
    const venda = tiposDisponiveis("venda");
    expect(tiposDisponiveis("captacao").find((t) => t.valor === "principal")?.rotulo)
      .toBe("Principal (outra etapa)");
    expect(venda.find((t) => t.valor === "principal")?.rotulo).toBe("Produto principal");
  });
});

describe("tipoPadraoDe", () => {
  it("na captação, o mesmo default do backend", () => {
    expect(tipoPadraoDe("captacao")).toBe(TIPO_PADRAO_CAPTACAO);
  });

  it("na venda, `principal` — e ele DIFERE do default do backend", () => {
    // É o ponto todo: por diferir, o salvamento grava a entrada explícita e o
    // backend para de cair em `ingresso` (que faria o produto da venda ancorar
    // checkouts de captação).
    expect(tipoPadraoDe("venda")).toBe("principal");
    expect(tipoPadraoDe("venda")).not.toBe(TIPO_PADRAO_CAPTACAO);
  });
});

describe("mapaParaPersistir com o default da venda", () => {
  const PRODUTOS = [
    { name: "Mentoria ClaudeLab | Basic e Advanced" },
    { name: "Mentoria ClaudeLab | Advanced" },
  ];

  it("grava `principal` na venda em vez de silenciar", () => {
    // Silenciar aqui seria o defeito: o backend leria `ingresso` e o produto
    // de R$ 4.500 entraria no denominador da captação.
    const escolhas = {
      "mentoria claudelab | basic e advanced": "principal",
      "mentoria claudelab | advanced": "principal",
    };
    const mapa = mapaParaPersistir(PRODUTOS, escolhas);
    expect(mapa["mentoria claudelab | basic e advanced"]).toBe("principal");
    expect(mapa["mentoria claudelab | advanced"]).toBe("principal");
  });

  it("o Combo escolhido na venda é gravado", () => {
    const mapa = mapaParaPersistir(PRODUTOS, {
      "mentoria claudelab | basic e advanced": "combo",
      "mentoria claudelab | advanced": "principal",
    });
    expect(mapa["mentoria claudelab | basic e advanced"]).toBe("combo");
  });
});

describe("permiteClassificarProdutos (D1 — o espelho)", () => {
  it("a etapa de Vendas NÃO classifica pelo espelho da captação", () => {
    expect(permiteClassificarProdutos("sales", "capture")).toBe(false);
  });

  it("mas classifica o produto que ela vende", () => {
    expect(permiteClassificarProdutos("sales", "main_product")).toBe(true);
    expect(permiteClassificarProdutos("sales", "tmb")).toBe(true);
  });

  it("a Captação Paga segue classificando a própria aba", () => {
    // Ela é a dona: esconder o botão aqui deixaria os 6 produtos do dg-pg04
    // sem nenhum lugar para serem classificados.
    expect(permiteClassificarProdutos("paid", "capture")).toBe(true);
    expect(permiteClassificarProdutos("event_capture", "capture")).toBe(true);
  });

  it("tipo desconhecido não perde a classificação por omissão", () => {
    // A regra é uma exceção nomeada, não uma allowlist: um tipo de etapa novo
    // não deve nascer sem poder classificar.
    expect(permiteClassificarProdutos(undefined, "capture")).toBe(true);
    expect(permiteClassificarProdutos("free", "capture")).toBe(true);
  });
});
