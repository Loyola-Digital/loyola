import { describe, expect, it } from "vitest";
import { reduzirResultados, type AcaoDeResultado } from "./resultados";

const aplicar = (acoes: AcaoDeResultado<unknown>[]): Record<string, unknown> =>
  acoes.reduce<Record<string, unknown>>(reduzirResultados, {});

describe("a leva vence a semente", () => {
  it("o número novo substitui o do widget recém-criado", () => {
    // O bug original: a semente tinha prioridade e o widget ficava com o número
    // do projeto anterior depois de trocar de projeto.
    const estado = aplicar([
      { tipo: "semear", widgetId: "w1", resultado: "gasto do projeto A" },
      { tipo: "chegou", widgetId: "w1", resultado: "gasto do projeto B" },
    ]);
    expect(estado.w1).toBe("gasto do projeto B");
  });

  it("a semente vale enquanto a leva não trouxe aquele widget", () => {
    // Para isso ela existe: o widget nasce preenchido em vez de piscar vazio.
    const estado = aplicar([{ tipo: "semear", widgetId: "w1", resultado: "recém-criado" }]);
    expect(estado.w1).toBe("recém-criado");
  });

  it("widgets diferentes não se atrapalham", () => {
    const estado = aplicar([
      { tipo: "chegou", widgetId: "w1", resultado: 1 },
      { tipo: "semear", widgetId: "w2", resultado: 2 },
    ]);
    expect(estado).toEqual({ w1: 1, w2: 2 });
  });
});

describe("trocar de contexto zera", () => {
  it("limpar apaga tudo — inclusive a semente", () => {
    // Trocar de projeto tem que apagar a semente também: ela é de outro recorte.
    const estado = aplicar([
      { tipo: "semear", widgetId: "w1", resultado: "projeto A" },
      { tipo: "chegou", widgetId: "w2", resultado: "projeto A" },
      { tipo: "limpar" },
    ]);
    expect(estado).toEqual({});
  });

  it("depois de limpar, a leva nova preenche do zero", () => {
    const estado = aplicar([
      { tipo: "semear", widgetId: "w1", resultado: "velho" },
      { tipo: "limpar" },
      { tipo: "chegou", widgetId: "w1", resultado: "novo" },
    ]);
    expect(estado.w1).toBe("novo");
  });
});

describe("imutabilidade", () => {
  it("o estado anterior não é mutado", () => {
    const antes = { w1: "a" };
    const depois = reduzirResultados(antes, { tipo: "chegou", widgetId: "w1", resultado: "b" });
    expect(antes.w1).toBe("a");
    expect(depois.w1).toBe("b");
  });
});
