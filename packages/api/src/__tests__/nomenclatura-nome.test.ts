/**
 * Story 47.3 / 47.8 — `buildCampaignName` e `parseCampaignName` (spec § 8;
 * ACs 3, 4, 12, 13 da § 10) no TEMPLATE V2 (47.8: dez campos, `perpetuo` na
 * 5ª posição). Módulo do `shared`, testado aqui porque o `shared` não tem
 * runner (mesmo caminho da 18.80 com `janela-de-dias`).
 */
import { describe, expect, it } from "vitest";
import {
  DICA_DO_PADRAO_ANTIGO,
  ORDEM_DOS_CAMPOS,
  ORDEM_DO_NOME,
  PERPETUO,
  buildCampaignName,
  parseCampaignName,
  pedacosDoNome,
  type DicionarioSnapshot,
} from "@loyola-x/shared";

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
const NOME = "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa";

describe("template v2 (Story 47.8) — a ordem do nome", () => {
  it("AC1: dez posições, funil na 2ª, produto na 3ª, perpetuo na 5ª", () => {
    expect(ORDEM_DO_NOME).toEqual(["expert", "funnel", "product", "offer", "kind", "year", "temperature", "auction", "format", "lp"]);
    expect(PERPETUO).toBe("perpetuo");
  });
  it("ORDEM_DOS_CAMPOS são os nove escolhidos, na ordem do nome, sem a constante", () => {
    expect(ORDEM_DOS_CAMPOS).toEqual(["expert", "funnel", "product", "offer", "year", "temperature", "auction", "format", "lp"]);
  });
});

describe("buildCampaignName", () => {
  it("AC 3 (v2): bbe/churrasco/a01/of01/2026/hot/cbo/videos/lpa → bbe_a01_churrasco_of01_perpetuo_… com 55 caracteres", () => {
    const nome = buildCampaignName(CAMPOS);
    expect(nome).toBe(NOME);
    expect(nome).toHaveLength(55);
  });
  it("AC 3 (exemplo do pedido do dono): dg / a01 / claude-negocios / of01 / abo → 60 caracteres", () => {
    const nome = buildCampaignName({ ...CAMPOS, expert: "dg", product: "claude-negocios", auction: "abo" });
    expect(nome).toBe("dg_a01_claude-negocios_of01_perpetuo_2026_hot_abo_videos_lpa");
    expect(nome).toHaveLength(60);
  });
  it("AC1 (reversão): o campo 5 é sempre perpetuo — não há como escolher outro", () => {
    expect(buildCampaignName(CAMPOS).split("_")[4]).toBe(PERPETUO);
    // um campo extra no objeto não entra no nome
    expect(buildCampaignName({ ...CAMPOS, kind: "lancamento" } as never)).toBe(NOME);
  });
  it("AC 4: com sufixo v02 termina em _lpa_v02", () => {
    expect(buildCampaignName({ ...CAMPOS, suffix: "v02" })).toMatch(/_lpa_v02$/);
  });
  it("AC2: lança nomeando o campo NA POSIÇÃO NOVA: vazio, caractere fora de [a-z0-9-], sufixo errado", () => {
    expect(() => buildCampaignName({ ...CAMPOS, offer: "" })).toThrow(/campo 4 \(oferta\): vazio/);
    expect(() => buildCampaignName({ ...CAMPOS, product: "churrasco_premium" })).toThrow(/campo 3 \(produto\)/);
    expect(() => buildCampaignName({ ...CAMPOS, funnel: "A01" })).toThrow(/campo 2 \(funil\)/);
    expect(() => buildCampaignName({ ...CAMPOS, format: "Videos" })).toThrow(/campo 9 \(formato\)/);
    expect(() => buildCampaignName({ ...CAMPOS, suffix: "v2" })).toThrow(/sufixo/);
  });
  it("AC3: pedacosDoNome devolve dez pedaços, perpetuo no bloco identidade e nunca faltando", () => {
    const p = pedacosDoNome({ expert: "bbe", product: "churrasco" });
    expect(p).toHaveLength(10);
    expect(p[0]).toMatchObject({ campo: "expert", bloco: "identidade", faltando: false });
    expect(p[1]).toMatchObject({ campo: "funnel", bloco: "identidade", faltando: true });
    expect(p[2]).toMatchObject({ campo: "product", bloco: "identidade", faltando: false });
    expect(p[4]).toMatchObject({ campo: "kind", valor: "perpetuo", bloco: "identidade", faltando: false });
    expect(p[5]).toMatchObject({ campo: "year", bloco: "ano", faltando: true });
    expect(p[9]).toMatchObject({ campo: "lp", bloco: "segmentacao", faltando: true });
    expect(pedacosDoNome({ ...CAMPOS, suffix: "v02" }).at(-1)).toMatchObject({ campo: "suffix", bloco: "sufixo" });
  });
});

describe("parseCampaignName — AC 12 no template v2", () => {
  it("nome válido devolve os nove campos escolhidos e dez partes", () => {
    const r = parseCampaignName(NOME, dic());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual(CAMPOS);
    expect(r.partes).toHaveLength(10);
  });
  it("oferta inexistente aponta o campo 4 com o expert", () => {
    const r = parseCampaignName("bbe_a01_churrasco_of09_perpetuo_2026_hot_cbo_videos_lpa", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('campo 4 (oferta): "of09" não está cadastrada para bbe');
  });
  it("AC1 (reversão): campo 5 diferente de perpetuo é erro apontando o campo 5", () => {
    const r = parseCampaignName("bbe_a01_churrasco_of01_lancamento_2026_hot_cbo_videos_lpa", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('campo 5 (tipo): "lancamento" — o único valor é "perpetuo"');
  });
  it("AC2: contagem errada aponta 9 separadores / 10 campos e não segue para a validação semântica", () => {
    const r = parseCampaignName("bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([
      'esperados 9 separadores "_" (10 campos), encontrados 8 (9 campos)',
      DICA_DO_PADRAO_ANTIGO,
    ]);
  });
  it("AC2: um nome no padrão v1 (9 campos) recebe a DICA do padrão anterior — e só a dica, sem conversão", () => {
    const v1 = "bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa";
    const r = parseCampaignName(v1, dic());
    expect(r.valid).toBe(false);
    expect(r.fields).toBeUndefined();
    expect(r.errors[1]).toBe(DICA_DO_PADRAO_ANTIGO);
    expect(DICA_DO_PADRAO_ANTIGO).toMatch(/padrão anterior \(9 campos, funil na 3ª posição\)/);
    // v1 com sufixo: o vNN sai, sobram 9 → mesma dica
    expect(parseCampaignName(`${v1}_v02`, dic()).errors).toContain(DICA_DO_PADRAO_ANTIGO);
    // 8 campos NÃO é o padrão antigo: sem dica
    expect(parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos", dic()).errors).toHaveLength(1);
  });
  it("sufixo vNN é aceito como 11º campo; 11º campo que não é vNN é erro de contagem", () => {
    const ok = parseCampaignName(`${NOME}_v02`, dic());
    expect(ok.valid).toBe(true);
    expect(ok.fields?.suffix).toBe("v02");
    const ruim = parseCampaignName(`${NOME}_x`, dic());
    expect(ruim.valid).toBe(false);
    expect(ruim.errors[0]).toMatch(/encontrados 10/);
  });
  it("caractere fora de [a-z0-9-] e maiúscula são erros estruturais, na posição nova", () => {
    expect(parseCampaignName("bbe_a01_churras co_of01_perpetuo_2026_hot_cbo_videos_lpa", dic()).errors).toContain('campo 3 (produto): "churras co" fora de [a-z0-9-]');
    expect(parseCampaignName("BBE_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa", dic()).errors.some((e) => /maiúscula/.test(e))).toBe(true);
    expect(parseCampaignName("bbe__churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa_x", dic()).valid).toBe(false);
  });
  it("produto e funil são POR EXPERT: hamburguer é do fz, não do bbe", () => {
    const r = parseCampaignName("bbe_a01_hamburguer_of01_perpetuo_2026_hot_cbo_videos_lpa", dic());
    expect(r.errors).toContain('campo 3 (produto): "hamburguer" não está cadastrado para bbe');
    expect(parseCampaignName("fz_a01_hamburguer_ofmix_perpetuo_2026_hot_cbo_videos_na", dic()).valid).toBe(true);
  });
  it("ofmix, lpmix e na são valores especiais válidos sem registro", () => {
    expect(parseCampaignName("bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_lpmix", dic()).valid).toBe(true);
    expect(parseCampaignName("bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na", dic()).valid).toBe(true);
  });
  it("com ofmix a LP pode ser de qualquer oferta do mesmo expert+produto+funil; com oferta fixa, só dela", () => {
    expect(parseCampaignName("bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_lpb", dic()).valid).toBe(true);
    const r = parseCampaignName("bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpb", dic());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('campo 10 (lp): "lpb" não está cadastrada para bbe/churrasco/a01/of01');
  });
  it("AC 13: carrossel em formato passa a valer sem mudar código — só o snapshot", () => {
    const nome = "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_carrossel_lpa";
    expect(parseCampaignName(nome, dic()).errors).toContain('campo 9 (formato): "carrossel" não está no dicionário de formato');
    const d = dic();
    d.valores.push({ type: "format", value: "carrossel", active: true });
    expect(parseCampaignName(nome, d).valid).toBe(true);
  });
  it("valor inativo é VÁLIDO com aviso (regra 4: nome antigo continua legível)", () => {
    const r = parseCampaignName("bbe_a01_churrasco_of02_perpetuo_2026_hot_cbo_estaticos_lpb", dic());
    expect(r.valid).toBe(true);
    expect(r.avisos).toEqual(["campo 4 (oferta): of02 está inativa", "campo 9 (formato): estaticos está inativo"]);
  });
  it("build → parse fecha o ciclo: o que o gerador monta, o validador lê de volta", () => {
    const r = parseCampaignName(buildCampaignName({ ...CAMPOS, suffix: "v03" }), dic());
    expect(r.valid).toBe(true);
    expect(r.fields).toEqual({ ...CAMPOS, suffix: "v03" });
  });
  it("vazio", () => {
    expect(parseCampaignName("", dic())).toMatchObject({ valid: false, errors: ["nome vazio"] });
  });
});
