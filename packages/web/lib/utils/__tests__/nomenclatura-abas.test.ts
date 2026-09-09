import { describe, expect, it } from "vitest";
import { abaAtiva, hrefDe } from "../nomenclatura-abas";

const params = (q: Record<string, string>) => new URLSearchParams(q);

describe("abaAtiva — a URL decide seção e aba (Epic 46, regra 1)", () => {
  it("sem nada → Dicionário / Experts", () => {
    expect(abaAtiva(params({}))).toEqual({ secao: "dicionario", aba: "experts" });
  });
  it("lê seção e aba válidas", () => {
    expect(abaAtiva(params({ secao: "dicionario", aba: "lps" }))).toEqual({ secao: "dicionario", aba: "lps" });
    expect(abaAtiva(params({ secao: "campanhas", aba: "validar" }))).toEqual({ secao: "campanhas", aba: "validar" });
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
