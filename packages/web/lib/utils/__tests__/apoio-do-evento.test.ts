import { describe, expect, it } from "vitest";
import { ehApoioDoEvento } from "../apoio-do-evento";

describe("ehApoioDoEvento", () => {
  it("empreendedor é o ingresso das equipes de patrocinador", () => {
    expect(ehApoioDoEvento({ ticket: "Empreendedor", tipo: "Fornecedor" })).toBe(true);
  });

  it("patrocinador escrito no tipo também conta", () => {
    expect(ehApoioDoEvento({ ticket: "VIP", tipo: "Patrocinador" })).toBe(true);
  });

  it("ignora acento e caixa", () => {
    expect(ehApoioDoEvento({ ticket: "EMPREENDEDOR", tipo: "" })).toBe(true);
    expect(ehApoioDoEvento({ ticket: "", tipo: "patrocinádor" })).toBe(true);
  });

  it("comprador fica na lista", () => {
    expect(ehApoioDoEvento({ ticket: "Black", tipo: "Titular" })).toBe(false);
    expect(ehApoioDoEvento({ ticket: "Cortesia", tipo: "Parceiro" })).toBe(false);
    expect(ehApoioDoEvento({ ticket: null, tipo: null })).toBe(false);
  });
});
