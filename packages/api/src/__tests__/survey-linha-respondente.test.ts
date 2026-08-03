import { describe, it, expect } from "vitest";
import { linhaTemRespondente } from "../services/survey-aggregation";

/**
 * Fix de jul/2026 — linhas em branco da planilha de pesquisa contavam como
 * respondente e inflavam o denominador de todas as perguntas.
 *
 * Números reais que motivaram o fix: a pesquisa do dg-pg04 tinha 1.717 linhas,
 * das quais **1.101 completamente vazias** (616 respondentes de verdade). O
 * dg-pg02, com 1.669 linhas, não tinha nenhuma — por isso o problema aparecia
 * só de um lado.
 */

describe("linhaTemRespondente — com coluna de e-mail", () => {
  const EMAIL = 1;

  it("linha com e-mail é respondente", () => {
    expect(linhaTemRespondente(["Fulano", "a@x.com", "119..."], EMAIL)).toBe(true);
  });

  it("linha sem e-mail NÃO é respondente, mesmo com outras colunas preenchidas", () => {
    // É o caso que importa: o formulário gravou nome e telefone mas o e-mail
    // ficou vazio — sem identificador, não dá para cruzar com comprador.
    expect(linhaTemRespondente(["Fulano", "", "119..."], EMAIL)).toBe(false);
  });

  it("e-mail só com espaços não conta", () => {
    expect(linhaTemRespondente(["Fulano", "   ", "119..."], EMAIL)).toBe(false);
  });

  it("linha completamente vazia não conta", () => {
    expect(linhaTemRespondente(["", "", ""], EMAIL)).toBe(false);
  });

  it("célula ausente (array curto) não explode", () => {
    expect(linhaTemRespondente(["Fulano"], EMAIL)).toBe(false);
    expect(linhaTemRespondente([], EMAIL)).toBe(false);
  });
});

describe("linhaTemRespondente — SEM coluna de e-mail", () => {
  const SEM_EMAIL = -1;

  it("descarta só a linha inteiramente em branco", () => {
    expect(linhaTemRespondente(["", "", ""], SEM_EMAIL)).toBe(false);
    expect(linhaTemRespondente(["  ", "\t", ""], SEM_EMAIL)).toBe(false);
  });

  it("qualquer célula preenchida faz a linha valer", () => {
    // Sem coluna de e-mail não dá para exigir e-mail — presumir que a planilha
    // tem um zeraria a pesquisa inteira.
    expect(linhaTemRespondente(["", "resposta", ""], SEM_EMAIL)).toBe(true);
  });

  it("array vazio não conta", () => {
    expect(linhaTemRespondente([], SEM_EMAIL)).toBe(false);
  });
});

describe("cenário do dg-pg04", () => {
  it("1.101 linhas vazias saem e 616 respondentes ficam", () => {
    const EMAIL = 4;
    const vazias = Array.from({ length: 1101 }, () => ["", "", "", "", "", ""]);
    const validas = Array.from({ length: 616 }, (_, i) => [
      `sub${i}`, `resp${i}`, "2026-07-15", "Fulano", `p${i}@x.com`, "119...",
    ]);
    const todas = [...validas, ...vazias];

    expect(todas).toHaveLength(1717);
    expect(todas.filter((r) => linhaTemRespondente(r, EMAIL))).toHaveLength(616);
  });

  it("o dg-pg02 não é afetado — não tinha linha vazia", () => {
    const EMAIL = 1;
    const linhas = Array.from({ length: 1281 }, (_, i) => ["Fulano", `p${i}@x.com`]);
    expect(linhas.filter((r) => linhaTemRespondente(r, EMAIL))).toHaveLength(1281);
  });
});
