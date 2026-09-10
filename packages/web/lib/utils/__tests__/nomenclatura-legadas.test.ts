import { describe, expect, it } from "vitest";
import { estadoDaSugestao, resumoDaSugestao } from "../nomenclatura-legadas";

const t = {
  produtos: [{ id: "p1", slug: "churrasco", expertId: "e1" }, { id: "p9", slug: "churrasco", expertId: "e9" }],
  funis: [{ id: "f1", code: "a01", expertId: "e1" }],
  ofertas: [{ id: "o1", code: "of01", expertId: "e1" }],
  lps: [{ id: "l1", code: "lpe", productId: "p1", funnelId: "f1", offerId: "o1" }],
};

describe("estadoDaSugestao — códigos viram ids, só do expert certo", () => {
  it("resolve produto/funil/lp do expert; o que não existe fica vazio", () => {
    const e = estadoDaSugestao({ campos: { product: "churrasco", funnel: "a01", lp: "lpe", year: "2026", temperature: "hot", auction: "cbo", format: "videos" }, confianca: {}, naoCadastrado: [] }, "e1", t);
    expect(e).toMatchObject({ expertId: "e1", productId: "p1", funnelId: "f1", lpId: "l1", offerId: "", year: "2026", temperature: "hot" });
  });
  it("produto com o mesmo slug de OUTRO expert não é usado", () => {
    expect(estadoDaSugestao({ campos: { product: "churrasco" }, confianca: {}, naoCadastrado: [] }, "e9", t).productId).toBe("p9");
    expect(estadoDaSugestao({ campos: { product: "churrasco" }, confianca: {}, naoCadastrado: [] }, "e2", t).productId).toBe("");
  });
  it("lp só quando produto e funil resolveram", () => {
    expect(estadoDaSugestao({ campos: { lp: "lpe" }, confianca: {}, naoCadastrado: [] }, "e1", t).lpId).toBe("");
  });
  it("ofmix passa como texto", () => {
    expect(estadoDaSugestao({ campos: { offer: "ofmix" }, confianca: {}, naoCadastrado: [] }, "e1", t).offerId).toBe("ofmix");
  });
});

describe("resumoDaSugestao", () => {
  it("lista o que achou na ordem do nome e o que faltou", () => {
    const r = resumoDaSugestao({ campos: { expert: "bbe", funnel: "a01", temperature: "hot" }, confianca: {}, naoCadastrado: ["formato vencedores"] });
    expect(r.achou).toBe("bbe · a01 · hot");
    expect(r.faltou).toBe("produto, oferta, ano, leilão, formato, lp, formato vencedores (não cadastrado)");
  });
  it("nada reconhecido", () => {
    expect(resumoDaSugestao({ campos: {}, confianca: {}, naoCadastrado: [] }).achou).toBe("nada reconhecido");
  });
});
