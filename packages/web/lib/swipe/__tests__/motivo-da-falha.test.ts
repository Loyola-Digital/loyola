import { describe, expect, it } from "vitest";
import { motivoDaFalha } from "../motivo-da-falha";

describe("motivoDaFalha", () => {
  it("separa bucket privado de arquivo inexistente", () => {
    // As duas falhas levam a lugares diferentes: uma é permissão no Supabase,
    // a outra é chave errada. Um recado só para as duas não resolveria nenhuma.
    expect(motivoDaFalha({ tipo: "http", status: 403 })).toMatch(/não é público/);
    expect(motivoDaFalha({ tipo: "http", status: 400 })).toMatch(/não é público/);
    expect(motivoDaFalha({ tipo: "http", status: 404 })).toMatch(/não encontrado/);
  });

  it("status inesperado aparece com o número, sem virar 'erro genérico'", () => {
    expect(motivoDaFalha({ tipo: "http", status: 502 })).toBe("O servidor devolveu 502");
  });

  it("sem link aponta para o servidor, não para o arquivo", () => {
    expect(motivoDaFalha({ tipo: "sem-link" })).toMatch(/storage não configurado/);
  });

  it("prazo e rede não se confundem", () => {
    expect(motivoDaFalha({ tipo: "prazo" })).toMatch(/Demorou demais/);
    expect(motivoDaFalha({ tipo: "rede" })).toMatch(/alcançar/);
  });
});
