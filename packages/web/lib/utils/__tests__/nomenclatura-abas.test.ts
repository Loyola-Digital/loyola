import { describe, expect, it } from "vitest";
import { ABAS_DE_CAMPANHAS, ABAS_DE_VSL, SECOES, abaAtiva, hrefDaSecao, hrefDe } from "../nomenclatura-abas";

const params = (q: Record<string, string>) => new URLSearchParams(q);

describe("abaAtiva — a URL decide seção e aba (Epic 46, regra 1)", () => {
  it("sem nada → Dicionário / Experts", () => {
    expect(abaAtiva(params({}))).toEqual({ secao: "dicionario", aba: "experts" });
  });
  it("lê seção e aba válidas", () => {
    expect(abaAtiva(params({ secao: "dicionario", aba: "lps" }))).toEqual({ secao: "dicionario", aba: "lps" });
    expect(abaAtiva(params({ secao: "campanhas", aba: "validar" }))).toEqual({ secao: "campanhas", aba: "validar" });
    expect(abaAtiva(params({ secao: "campanhas", aba: "legadas" }))).toEqual({ secao: "campanhas", aba: "legadas" });
  });
  it("aba desconhecida cai no default da seção; seção desconhecida cai no default geral", () => {
    expect(abaAtiva(params({ secao: "dicionario", aba: "xpto" }))).toEqual({ secao: "dicionario", aba: "experts" });
    expect(abaAtiva(params({ secao: "xpto", aba: "lps" }))).toEqual({ secao: "dicionario", aba: "lps" });
  });
  it("aba de outra seção não vaza: ?secao=campanhas&aba=lps → campanhas/nova", () => {
    expect(abaAtiva(params({ secao: "campanhas", aba: "lps" }))).toEqual({ secao: "campanhas", aba: "nova" });
  });
  it("hrefDe monta a URL que abaAtiva lê de volta", () => {
    const href = hrefDe("dicionario", "ofertas");
    expect(href).toBe("/settings/nomenclatura?secao=dicionario&aba=ofertas");
    expect(abaAtiva(new URL(href, "http://x").searchParams)).toEqual({ secao: "dicionario", aba: "ofertas" });
  });
});

describe("Slug de LP é seção própria (Story 47.7)", () => {
  it("AC1: ?secao=slug abre a seção, sem aba", () => {
    expect(abaAtiva(params({ secao: "slug" }))).toEqual({ secao: "slug" });
    // qualquer `aba` junto é ignorada — a seção não tem sub-abas
    expect(abaAtiva(params({ secao: "slug", aba: "nova" }))).toEqual({ secao: "slug" });
  });
  it("AC1: a seção vem depois de Campanhas na ordem da tela", () => {
    const ordem = SECOES.map((s) => s.value);
    expect(ordem.indexOf("slug")).toBe(ordem.indexOf("campanhas") + 1);
  });
  it("AC2: Campanhas não tem mais a sub-aba slug", () => {
    expect(ABAS_DE_CAMPANHAS.map((a) => a.value)).toEqual(["nova", "lista", "validar", "legadas"]);
  });
  it("AC3: o link antigo ?secao=campanhas&aba=slug continua abrindo a mesma tela", () => {
    // Sem a compatibilidade, cairia em campanhas/nova e quem guardou o link da
    // validação visual de 2026-09-09 abriria o gerador de campanha.
    expect(abaAtiva(params({ secao: "campanhas", aba: "slug" }))).toEqual({ secao: "slug" });
  });
  it("hrefDe sem aba e hrefDaSecao fecham o ciclo com abaAtiva", () => {
    expect(hrefDe("slug")).toBe("/settings/nomenclatura?secao=slug");
    expect(hrefDaSecao("slug")).toBe("/settings/nomenclatura?secao=slug");
    expect(hrefDaSecao("campanhas")).toBe("/settings/nomenclatura?secao=campanhas&aba=nova");
    expect(hrefDaSecao("dicionario")).toBe("/settings/nomenclatura?secao=dicionario&aba=experts");
    for (const s of SECOES) {
      expect(abaAtiva(new URL(hrefDaSecao(s.value), "http://x").searchParams).secao).toBe(s.value);
    }
  });
});

describe("Nome VSL é seção com três abas (Story 47.9)", () => {
  it("AC6: ?secao=vsl abre Nova VSL por padrão; abas nova · lista · variaveis; à direita de Slug de LP", () => {
    expect(abaAtiva(params({ secao: "vsl" }))).toEqual({ secao: "vsl", aba: "nova" });
    expect(abaAtiva(params({ secao: "vsl", aba: "variaveis" }))).toEqual({ secao: "vsl", aba: "variaveis" });
    expect(abaAtiva(params({ secao: "vsl", aba: "lps" }))).toEqual({ secao: "vsl", aba: "nova" });
    expect(ABAS_DE_VSL.map((a) => a.value)).toEqual(["nova", "lista", "variaveis"]);
    const ordem = SECOES.map((s) => s.value);
    expect(ordem.indexOf("vsl")).toBe(ordem.indexOf("slug") + 1);
    expect(hrefDaSecao("vsl")).toBe("/settings/nomenclatura?secao=vsl&aba=nova");
    expect(abaAtiva(new URL(hrefDe("vsl", "lista"), "http://x").searchParams)).toEqual({ secao: "vsl", aba: "lista" });
  });
});
