import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESTADO_VAZIO,
  anoPadrao,
  aoEscolher,
  camposDoNome,
  corpoDaCampanha,
  estadoDeCampanha,
  opcoesDeLp,
  opcoesDeOferta,
  previaDoNome,
} from "../nomenclatura-gerador";

const cheio = { ...ESTADO_VAZIO, expertId: "e", productId: "p", funnelId: "f", offerId: "o", year: "2026", temperature: "hot", auction: "cbo", format: "videos", lpId: "l" };

describe("AC 1 — cascata do gerador", () => {
  it("trocar o expert limpa produto, funil, oferta E LP; mantém ano/temp/leilão/formato", () => {
    const r = aoEscolher(cheio, "expertId", "e2");
    expect(r).toMatchObject({ expertId: "e2", productId: "", funnelId: "", offerId: "", lpId: "", year: "2026", temperature: "hot", auction: "cbo", format: "videos" });
  });
  it("trocar produto, funil ou oferta limpa só a LP", () => {
    expect(aoEscolher(cheio, "productId", "p2").lpId).toBe("");
    expect(aoEscolher(cheio, "funnelId", "f2")).toMatchObject({ productId: "p", offerId: "o", lpId: "" });
    expect(aoEscolher(cheio, "offerId", "ofmix")).toMatchObject({ productId: "p", funnelId: "f", lpId: "" });
  });
  it("trocar ano/temperatura/leilão/formato não limpa nada; mesmo valor devolve o mesmo objeto", () => {
    expect(aoEscolher(cheio, "format", "mix").lpId).toBe("l");
    expect(aoEscolher(cheio, "expertId", "e")).toBe(cheio);
  });
});

describe("AC 2 — opções dos selects", () => {
  it("oferta: as do expert na ordem, e ofmix POR ÚLTIMO com o rótulo da spec", () => {
    const ops = opcoesDeOferta([
      { id: "1", rotulo: "of01 — oferta com ticket médio de R$ 347" },
      { id: "2", rotulo: "of02 — oferta com ticket médio de R$ 297" },
    ]);
    expect(ops.map((o) => o.rotulo)).toEqual([
      "of01 — oferta com ticket médio de R$ 347",
      "of02 — oferta com ticket médio de R$ 297",
      "ofmix — a campanha carrega mais de uma oferta",
    ]);
    expect(ops.at(-1)).toMatchObject({ value: "ofmix", fixa: true });
  });
  const lps = [
    { id: "a", code: "lpa", slug: "bbe-churrasco-a01-of01-lpa", productId: "p", funnelId: "f", offerId: "o1" },
    { id: "b", code: "lpb", slug: "bbe-churrasco-a01-of02-lpb", productId: "p", funnelId: "f", offerId: "o2" },
    { id: "c", code: "lpa", slug: "bbe-hamburguer-a01-of01-lpa", productId: "p2", funnelId: "f", offerId: "o1" },
  ];
  it("LP: só as da combinação, rótulo `código — slug`, e lpmix/na sempre ao fim", () => {
    const ops = opcoesDeLp(lps, { productId: "p", funnelId: "f", offerId: "o1" });
    expect(ops.map((o) => o.rotulo)).toEqual(["lpa — bbe-churrasco-a01-of01-lpa", "lpmix — a LP varia por anúncio", "na — sem LP"]);
  });
  it("LP com ofmix: todas as ofertas do mesmo expert+produto+funil", () => {
    const ops = opcoesDeLp(lps, { productId: "p", funnelId: "f", offerId: "ofmix" });
    expect(ops.filter((o) => !o.fixa).map((o) => o.value)).toEqual(["a", "b"]);
  });
  it("sem combinação, só as fixas", () => {
    expect(opcoesDeLp(lps, { productId: "", funnelId: "", offerId: "" }).map((o) => o.value)).toEqual(["lpmix", "na"]);
  });
});

describe("ano padrão", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("pré-seleciona o ano corrente se existir no dicionário; senão vazio", () => {
    vi.setSystemTime(new Date("2026-09-09T12:00:00-03:00"));
    const ano = new Date().getFullYear();
    expect(anoPadrao([{ value: "2026" }, { value: "2027" }], ano)).toBe("2026");
    expect(anoPadrao([{ value: "2027" }], ano)).toBe("");
  });
});

describe("AC 3/4 — prévia com a MESMA função do servidor", () => {
  const t = { experts: [{ id: "e", code: "bbe" }], produtos: [{ id: "p", slug: "churrasco" }], funis: [{ id: "f", code: "a01" }], ofertas: [{ id: "o", code: "of01" }], lps: [{ id: "l", code: "lpa" }] };
  it("completo: 55 caracteres, exatamente o nome do template v2 (47.8)", () => {
    const p = previaDoNome(camposDoNome(cheio, t));
    expect(p.nome).toBe("bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa");
    expect(p.tamanho).toBe(55);
    expect(p.completo).toBe(true);
  });
  it("sufixo v02 entra no fim; ofmix/na entram como texto", () => {
    expect(previaDoNome(camposDoNome({ ...cheio, suffix: "v02" }, t)).nome).toMatch(/_lpa_v02$/);
    expect(previaDoNome(camposDoNome({ ...cheio, offerId: "ofmix", lpId: "na" }, t)).nome).toBe("bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_na");
  });
  it("parcial: `…` no lugar do que falta, sem nome, Salvar bloqueado", () => {
    const p = previaDoNome(camposDoNome({ ...cheio, funnelId: "", lpId: "" }, t));
    expect(p.nome).toBeNull();
    expect(p.completo).toBe(false);
    expect(p.texto).toBe("bbe_…_churrasco_of01_perpetuo_2026_hot_cbo_videos_…");
    expect(p.pedacos.filter((x) => x.faltando).map((x) => x.campo)).toEqual(["funnel", "lp"]);
  });
  it("sufixo fora do formato: completo mas com erro, sem nome", () => {
    const p = previaDoNome(camposDoNome({ ...cheio, suffix: "v2" }, t));
    expect(p.nome).toBeNull();
    expect(p.erro).toMatch(/sufixo/);
  });
});

describe("ida e volta com a API", () => {
  it("corpoDaCampanha: ofmix vira offerId null; lpmix/na viram landingPageId null + lpValue", () => {
    expect(corpoDaCampanha({ ...cheio, offerId: "ofmix", lpId: "lpmix", suffix: "", notes: " " })).toMatchObject({ offerId: null, landingPageId: null, lpValue: "lpmix", suffix: null, notes: null });
    expect(corpoDaCampanha(cheio)).toMatchObject({ offerId: "o", landingPageId: "l", lpValue: undefined });
  });
  it("estadoDeCampanha: o que veio do banco volta ao estado (Editar/Duplicar)", () => {
    const e = estadoDeCampanha({ expertId: "e", productId: "p", funnelId: "f", offerId: null, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos", suffix: "v02", notes: null });
    expect(e).toMatchObject({ offerId: "ofmix", lpId: "na", suffix: "v02", notes: "" });
  });
});
