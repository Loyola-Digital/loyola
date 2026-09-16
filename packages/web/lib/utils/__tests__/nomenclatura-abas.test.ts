import { describe, expect, it } from "vitest";
import { ABAS_DE_ADS, ABAS_DE_CAMPANHAS, ABAS_DE_VSL, ABAS_DO_DICIONARIO, SECOES, abaAtiva, expertInicialDaUrl, hrefDaSecao, hrefDe } from "../nomenclatura-abas";

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
  it("AC6: ?secao=vsl abre Nova VSL por padrão; abas nova · lista; à direita de Slug de LP", () => {
    expect(abaAtiva(params({ secao: "vsl" }))).toEqual({ secao: "vsl", aba: "nova" });
    expect(abaAtiva(params({ secao: "vsl", aba: "lps" }))).toEqual({ secao: "vsl", aba: "nova" });
    expect(ABAS_DE_VSL.map((a) => a.value)).toEqual(["nova", "lista"]);
    const ordem = SECOES.map((s) => s.value);
    expect(ordem.indexOf("vsl")).toBe(ordem.indexOf("slug") + 1);
    expect(hrefDaSecao("vsl")).toBe("/settings/nomenclatura?secao=vsl&aba=nova");
    expect(abaAtiva(new URL(hrefDe("vsl", "lista"), "http://x").searchParams)).toEqual({ secao: "vsl", aba: "lista" });
  });
});

describe("Nome Ads é seção com três abas (Story 47.10)", () => {
  it("AC7: ?secao=ads abre Novo anúncio por padrão; abas novo · lista · valores; à direita de Nome VSL", () => {
    expect(abaAtiva(params({ secao: "ads" }))).toEqual({ secao: "ads", aba: "novo" });
    expect(abaAtiva(params({ secao: "ads", aba: "valores" }))).toEqual({ secao: "ads", aba: "valores" });
    expect(abaAtiva(params({ secao: "ads", aba: "nova" }))).toEqual({ secao: "ads", aba: "novo" });
    // Story 47.12: aba "Hooks e bodies" à direita de Valores fixos
    expect(ABAS_DE_ADS.map((a) => a.value)).toEqual(["novo", "lista", "valores", "partes"]);
    expect(abaAtiva(params({ secao: "ads", aba: "partes" }))).toEqual({ secao: "ads", aba: "partes" });
    const ordem = SECOES.map((s) => s.value);
    expect(ordem.indexOf("ads")).toBe(ordem.indexOf("vsl") + 1);
    expect(hrefDaSecao("ads")).toBe("/settings/nomenclatura?secao=ads&aba=novo");
  });
});

describe("Variáveis de VSL moram no Dicionário (decisão do dono, 2026-09-10)", () => {
  it("é a última aba do Dicionário; o link antigo ?secao=vsl&aba=variaveis abre a mesma tela lá", () => {
    expect(ABAS_DO_DICIONARIO.map((a) => a.value).at(-1)).toBe("variaveis-vsl");
    expect(abaAtiva(params({ secao: "dicionario", aba: "variaveis-vsl" }))).toEqual({ secao: "dicionario", aba: "variaveis-vsl" });
    expect(abaAtiva(params({ secao: "vsl", aba: "variaveis" }))).toEqual({ secao: "dicionario", aba: "variaveis-vsl" });
  });
});

// Story 47.14 — o link do aviso leva o expert; a aba só aceita expert que existe.
describe("47.14 — expertId na URL da aba Hooks e bodies", () => {
  it("hrefDe com expertId acrescenta o parâmetro codificado e abaAtiva continua lendo a aba", () => {
    const href = hrefDe("ads", "partes", { expertId: "b7c1/x y" });
    expect(href).toBe("/settings/nomenclatura?secao=ads&aba=partes&expertId=b7c1%2Fx%20y");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(abaAtiva(params)).toEqual({ secao: "ads", aba: "partes" });
    expect(params.get("expertId")).toBe("b7c1/x y");
  });

  it("hrefDe sem expertId (undefined, null ou vazio) não muda a URL de antes", () => {
    expect(hrefDe("ads", "partes")).toBe("/settings/nomenclatura?secao=ads&aba=partes");
    expect(hrefDe("ads", "partes", {})).toBe("/settings/nomenclatura?secao=ads&aba=partes");
    expect(hrefDe("ads", "partes", { expertId: null })).toBe("/settings/nomenclatura?secao=ads&aba=partes");
    expect(hrefDe("ads", "partes", { expertId: "" })).toBe("/settings/nomenclatura?secao=ads&aba=partes");
    expect(hrefDe("ads", "valores", { expertId: "abc" })).toBe("/settings/nomenclatura?secao=ads&aba=valores&expertId=abc");
  });

  it("expertInicialDaUrl devolve o id só quando ele está na lista", () => {
    const experts = [{ id: "e1" }, { id: "e2" }];
    expect(expertInicialDaUrl("e2", experts)).toBe("e2");
    // AC5: parâmetro inválido → seletor vazio, sem erro.
    expect(expertInicialDaUrl("nao-existe", experts)).toBe("");
    expect(expertInicialDaUrl("", experts)).toBe("");
    expect(expertInicialDaUrl(null, experts)).toBe("");
    expect(expertInicialDaUrl(undefined, experts)).toBe("");
    // Lista ainda não carregada: nada a aplicar (quem chama espera a lista).
    expect(expertInicialDaUrl("e1", undefined)).toBe("");
    expect(expertInicialDaUrl("e1", [])).toBe("");
  });
});
