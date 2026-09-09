import { describe, expect, it } from "vitest";
import {
  CASCATA_VAZIA,
  aoTrocarNivel,
  cascataCompleta,
  casaBusca,
  previaDeNormalizacao,
  previaDeSlug,
  textoDaCascata,
  textoDeCampoUsado,
} from "../nomenclatura-cascata";

describe("cascata expert → produto → funil → oferta (spec § 6, LPs)", () => {
  const cheia = { expertId: "e", productId: "p", funnelId: "f", offerId: "o" };
  it("trocar o expert limpa produto, funil e oferta", () => {
    expect(aoTrocarNivel(cheia, "expertId", "e2")).toEqual({ expertId: "e2", productId: "", funnelId: "", offerId: "" });
  });
  it("trocar o funil limpa só a oferta", () => {
    expect(aoTrocarNivel(cheia, "funnelId", "f2")).toEqual({ expertId: "e", productId: "p", funnelId: "f2", offerId: "" });
  });
  it("trocar a oferta não limpa nada acima", () => {
    expect(aoTrocarNivel(cheia, "offerId", "o2")).toEqual({ ...cheia, offerId: "o2" });
  });
  it("trocar pelo mesmo valor devolve o mesmo objeto (sem limpar)", () => {
    expect(aoTrocarNivel(cheia, "expertId", "e")).toBe(cheia);
  });
  it("cascataCompleta só com os quatro", () => {
    expect(cascataCompleta(CASCATA_VAZIA)).toBe(false);
    expect(cascataCompleta({ ...cheia, offerId: "" })).toBe(false);
    expect(cascataCompleta(cheia)).toBe(true);
  });
});

describe("prévias com a MESMA função do servidor", () => {
  it('"Churrasco Premium" → churrasco-premium; "churrasco_premium" → erro com motivo', () => {
    expect(previaDeNormalizacao("Churrasco Premium", "produto")).toEqual({ ok: true, valor: "churrasco-premium" });
    const r = previaDeNormalizacao("churrasco_premium", "produto");
    expect(r?.ok).toBe(false);
    expect(previaDeNormalizacao("   ", "produto")).toBeNull();
  });
  it("slug da LP: bbe-churrasco-a01-of01-lpa; falta parte → null; código inválido → null", () => {
    expect(previaDeSlug({ expert: "bbe", produto: "churrasco", funil: "a01", oferta: "of01", codigo: "LPA" })).toBe("bbe-churrasco-a01-of01-lpa");
    expect(previaDeSlug({ expert: "bbe", produto: "churrasco", funil: "a01", codigo: "lpa" })).toBeNull();
    expect(previaDeSlug({ expert: "bbe", produto: "churrasco", funil: "a01", oferta: "of01", codigo: "lp1" })).toBeNull();
  });
});

describe("textos literais da spec § 5", () => {
  it("campo usado", () => {
    expect(textoDeCampoUsado(3)).toBe("Usado em 3 campanha(s). Para mudar o significado, crie um código novo.");
  });
  it("cascata com todos os tipos", () => {
    expect(textoDaCascata("bbe", { produtos: 2, funis: 3, ofertas: 4, lps: 5 })).toBe("Isso desativa 2 produtos, 3 funis, 4 ofertas e 5 LPs de bbe. Continuar?");
  });
  it("cascata com um tipo só e singular", () => {
    expect(textoDaCascata("fz", { produtos: 0, funis: 1, ofertas: 0, lps: 0 })).toBe("Isso desativa 1 funil de fz. Continuar?");
  });
  it("sem filhos ativos não fala de cascata", () => {
    expect(textoDaCascata("dg", { produtos: 0, funis: 0, ofertas: 0, lps: 0 })).toMatch(/^Desativar dg\?/);
  });
});

describe("busca client-side", () => {
  const linha = { code: "of01", description: "oferta com ticket médio de R$ 347" };
  it("sem acento e sem caixa", () => {
    expect(casaBusca("MEDIO", linha, ["code", "description"])).toBe(true);
    expect(casaBusca("of0", linha, ["code"])).toBe(true);
    expect(casaBusca("347", linha, ["code"])).toBe(false);
    expect(casaBusca("", linha, [])).toBe(true);
  });
});
