/**
 * Story 47.3 — `buildCampaignName` e `parseCampaignName` (spec § 8; ACs 3, 4,
 * 12, 13 da § 10). Módulo do `shared`, testado aqui porque o `shared` não tem
 * runner (mesmo caminho da 18.80 com `janela-de-dias`).
 */
import { describe, expect, it } from "vitest";
import { buildCampaignName, parseCampaignName, pedacosDoNome, type DicionarioSnapshot } from "@loyola-x/shared";

const dic = (): DicionarioSnapshot => ({
  experts: [
    { code: "bbe", active: true },
    { code: "fz", active: true },
  ],
  produtos: [
    { expert: "bbe", slug: "churrasco", active: true },
    { expert: "fz", slug: "hamburguer", active: true },
  ],
  funis: [
    { expert: "bbe", code: "a01", active: true },
    { expert: "fz", code: "a01", active: true },
  ],
  ofertas: [
    { expert: "bbe", code: "of01", active: true },
    { expert: "bbe", code: "of02", active: false },
  ],
  lps: [
    { expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", code: "lpa", active: true },
    { expert: "bbe", product: "churrasco", funnel: "a01", offer: "of02", code: "lpb", active: true },
  ],
  valores: [
    { type: "year", value: "2026", active: true },
    { type: "temperature", value: "hot", active: true },
    { type: "auction", value: "cbo", active: true },
    { type: "format", value: "videos", active: true },
    { type: "format", value: "estaticos", active: false },
  ],
});

const CAMPOS = { expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", year: "2026", temperature: "hot", auction: "cbo", format: "videos", lp: "lpa" };

describe("buildCampaignName", () => {
  it("AC 3: bbe/churrasco/a01/of01/2026/hot/cbo/videos/lpa → 46 caracteres", () => {
    const nome = buildCampaignName(CAMPOS);
    expect(nome).toBe("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa");
    expect(nome).toHaveLength(46);
  });
  it("AC 4: com sufixo v02 termina em _lpa_v02", () => {
    expect(buildCampaignName({ ...CAMPOS, suffix: "v02" })).toMatch(/_lpa_v02$/);
  });
  it("lança nomeando o campo: vazio, caractere fora de [a-z0-9-], sufixo errado", () => {
    expect(() => buildCampaignName({ ...CAMPOS, offer: "" })).toThrow(/campo 4 \(oferta\): vazio/);
    expect(() => buildCampaignName({ ...CAMPOS, product: "churrasco_premium" })).toThrow(/campo 2 \(produto\)/);
    expect(() => buildCampaignName({ ...CAMPOS, format: "Videos" })).toThrow(/campo 8 \(formato\)/);
    expect(() => buildCampaignName({ ...CAMPOS, suffix: "v2" })).toThrow(/sufixo/);
  });
  it("pedacosDoNome marca o que falta e o bloco de cada campo", () => {
    const p = pedacosDoNome({ expert: "bbe", product: "churrasco" });
    expect(p).toHaveLength(9);
    expect(p[0]).toMatchObject({ campo: "expert", bloco: "identidade", faltando: false });
    expect(p[4]).toMatchObject({ campo: "year", bloco: "ano", faltando: true });
    expect(p[8]).toMatchObject({ campo: "lp", bloco: "segmentacao", faltando: true });
    expect(pedacosDoNome({ ...CAMPOS, suffix: "v02" }).at(-1)).toMatchObject({ campo: "suffix", bloco: "sufixo" });
  });
});

describe("parseCampaignName — AC 12", () => {
  it("nome válido devolve os nove campos", () => {
    const r = parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa", dic());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual(CAMPOS);
    expect(r.partes).toHaveLength(9);
  });
  it("oferta inexistente aponta o campo 4 com o expert", () => {
    const r = parseCampaignName("bbe_churrasco_a01_of09_2026_hot_cbo_videos_lpa", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('campo 4 (oferta): "of09" não está cadastrada para bbe');
  });
  it("7 underscores aponta a contagem e não segue para a validação semântica", () => {
    const r = parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['esperados 8 separadores "_" (9 campos), encontrados 7 (8 campos)']);
  });
  it("sufixo vNN é aceito como décimo campo; décimo campo que não é vNN é erro de contagem", () => {
    const ok = parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa_v02", dic());
    expect(ok.valid).toBe(true);
    expect(ok.fields?.suffix).toBe("v02");
    const ruim = parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa_x", dic());
    expect(ruim.valid).toBe(false);
    expect(ruim.errors[0]).toMatch(/encontrados 9/);
  });
  it("caractere fora de [a-z0-9-] e maiúscula são erros estruturais", () => {
    expect(parseCampaignName("bbe_churras co_a01_of01_2026_hot_cbo_videos_lpa", dic()).errors).toContain('campo 2 (produto): "churras co" fora de [a-z0-9-]');
    expect(parseCampaignName("BBE_churrasco_a01_of01_2026_hot_cbo_videos_lpa", dic()).errors.some((e) => /maiúscula/.test(e))).toBe(true);
    expect(parseCampaignName("bbe__a01_of01_2026_hot_cbo_videos_lpa_x", dic()).valid).toBe(false);
  });
  it("produto e funil são POR EXPERT: hamburguer é do fz, não do bbe", () => {
    const r = parseCampaignName("bbe_hamburguer_a01_of01_2026_hot_cbo_videos_lpa", dic());
    expect(r.errors).toContain('campo 2 (produto): "hamburguer" não está cadastrado para bbe');
    expect(parseCampaignName("fz_hamburguer_a01_ofmix_2026_hot_cbo_videos_na", dic()).valid).toBe(true);
  });
  it("ofmix, lpmix e na são valores especiais válidos sem registro", () => {
    expect(parseCampaignName("bbe_churrasco_a01_ofmix_2026_hot_cbo_videos_lpmix", dic()).valid).toBe(true);
    expect(parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_na", dic()).valid).toBe(true);
  });
  it("com ofmix a LP pode ser de qualquer oferta do mesmo expert+produto+funil; com oferta fixa, só dela", () => {
    expect(parseCampaignName("bbe_churrasco_a01_ofmix_2026_hot_cbo_videos_lpb", dic()).valid).toBe(true);
    const r = parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpb", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('campo 9 (lp): "lpb" não está cadastrada para bbe/churrasco/a01/of01');
  });
  it("AC 13: carrossel em formato passa a valer sem mudar código — só o snapshot", () => {
    const nome = "bbe_churrasco_a01_of01_2026_hot_cbo_carrossel_lpa";
    expect(parseCampaignName(nome, dic()).errors).toContain('campo 8 (formato): "carrossel" não está no dicionário de formato');
    const d = dic();
    d.valores.push({ type: "format", value: "carrossel", active: true });
    expect(parseCampaignName(nome, d).valid).toBe(true);
  });
  it("valor inativo é VÁLIDO com aviso (regra 4: nome antigo continua legível)", () => {
    const r = parseCampaignName("bbe_churrasco_a01_of02_2026_hot_cbo_estaticos_lpb", dic());
    expect(r.valid).toBe(true);
    expect(r.avisos).toEqual(["campo 4 (oferta): of02 está inativa", "campo 8 (formato): estaticos está inativo"]);
  });
  it("vazio", () => {
    expect(parseCampaignName("", dic())).toMatchObject({ valid: false, errors: ["nome vazio"] });
  });
});
