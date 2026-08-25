/**
 * Story 18.69 — verificação por reversão do que se persiste ao salvar.
 */
import { describe, it, expect } from "vitest";
import { mapaParaPersistir } from "../classificacao-produtos";

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
