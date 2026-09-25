/**
 * Story 29.79 (AC1) — funil e oferta lidos do NOME da campanha.
 *
 * Os positivos são nomes reais dos seis perpétuos (medidos em produção em
 * 2026-09-23, inclusive o SELECT do R3); os negativos, os contraexemplos que a
 * story nomeia.
 */
import { describe, expect, it } from "vitest";
import {
  lerFunilDoNome,
  lerOfertaDoNome,
  lerFunilEOfertaDoNome,
  MOTIVO_SEM_CODIGO,
  MOTIVO_MAIS_DE_UM_CODIGO,
  MOTIVO_OFERTA_MISTA,
  sugerirClassificacao,
} from "@loyola-x/shared";

const ok = (codigo: string) => ({ codigo, motivo: null });
const sem = (motivo: string) => ({ codigo: null, motivo });

describe("funil pelo nome — as duas formas de produção", () => {
  it.each([
    // bbe_churrasco (legada estruturada, `a1` delimitado por `-`)
    ["bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos", "a01"],
    ["bbe-a2-ago-26--venda--perpetuo--cold_abo_vencedores", "a02"],
    // bbe_hamburguer (gerador v2)
    ["bbe_a01_hamburguer_of01_perpetuo_2026_hot_cbo_videos_lpa", "a01"],
    // dg_claude-negocio (renomeada; o nome de HOJE)
    ["dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa", "a02"],
    // pps_fundamentos
    ["pps-a1-jul-26--venda--perpetuo--cold--estaticos", "a01"],
    // fz_english-kids-club: 62,6 % do gasto está na forma colada
    ["[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]", "a01"],
    ["[FZA1][FB/IG][LEADS][2025.08.25][HOT][ALL-IN-ONE]", "a01"],
    ["fz-a1-ago-26--venda--perpetuo--hot_cbo_lpd", "a01"],
    // dg-a1: `[DGA1]` no FIM, depois de um `[F01]` que NÃO é funil
    ["[F01][FB/IG][LEADS][2025.05.30][ADV][COLD][ASC][DGA1]", "a01"],
  ])("%s → %s", (nome, codigo) => {
    expect(lerFunilDoNome(nome)).toEqual(ok(codigo));
  });

  it("a1 ≡ a01 (6.2) e [FZA1] conta (6.3): as duas formas no MESMO nome são UM código", () => {
    expect(lerFunilDoNome("[FZA1]_fz_a01_teste")).toEqual(ok("a01"));
    expect(lerFunilDoNome("bbe_a1_x_a01")).toEqual(ok("a01"));
  });

  it("sem distinção de caixa", () => {
    expect(lerFunilDoNome("BBE_A01_HAMBURGUER_OF01")).toEqual(ok("a01"));
    expect(lerFunilDoNome("[fza1]")).toEqual(ok("a01"));
  });

  it("dois dígitos acima de 9 ficam como estão", () => {
    expect(lerFunilDoNome("bbe_a12_x")).toEqual(ok("a12"));
  });
});

describe("funil — os negativos (nunca chute)", () => {
  it("`[30-14-7-5A1]` não vira funil", () => {
    expect(lerFunilDoNome("[30-14-7-5A1]")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome("[VENDAS][30-14-7-5A1] - teste")).toEqual(sem(MOTIVO_SEM_CODIGO));
  });

  it("`a1` dentro de palavra não vira funil", () => {
    expect(lerFunilDoNome("lança1")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome("lanca1_teste")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome("campanha_ba1_x")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome("bbe_a10x_y")).toEqual(sem(MOTIVO_SEM_CODIGO));
  });

  it("três dígitos não são funil (`a012`)", () => {
    expect(lerFunilDoNome("bbe_a012_x")).toEqual(sem(MOTIVO_SEM_CODIGO));
  });

  it("texto livre sem código", () => {
    expect(lerFunilDoNome("[VENDAS] [PERPETUO] [CPF] [FRIO] - Teste de criativos")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome("")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerFunilDoNome(null)).toEqual(sem(MOTIVO_SEM_CODIGO));
  });

  it("mais de um código DISTINTO → null com o motivo (PO-08)", () => {
    expect(lerFunilDoNome("bbe_a01_x_a02")).toEqual(sem(MOTIVO_MAIS_DE_UM_CODIGO));
    expect(lerFunilDoNome("[FZA1]_fz_a02")).toEqual(sem(MOTIVO_MAIS_DE_UM_CODIGO));
  });

  it("o funil vem do NOME DA CAMPANHA: a leitura não sabe de anúncio — `adv04--fz-a1--h04--a04` teria dois", () => {
    // É o falso positivo que matou a leitura por `utm_term` (conjunto e anúncio
    // colados ao nome da campanha). Aqui ele aparece como o que é: ambíguo.
    expect(lerFunilDoNome("adv04--fz-a1--h04--a04")).toEqual(sem(MOTIVO_MAIS_DE_UM_CODIGO));
  });
});

describe("oferta pelo nome", () => {
  it.each([
    ["bbe_a01_hamburguer_of01_perpetuo_2026_hot_cbo_videos_lpa", "of01"],
    ["dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa", "of03"],
    ["bbe-a1-jul-26--of2--perpetuo", "of02"],
    ["BBE_A01_X_OF01", "of01"],
  ])("%s → %s", (nome, codigo) => {
    expect(lerOfertaDoNome(nome)).toEqual(ok(codigo));
  });

  it("nome antigo sem oferta → null (é o caso de 0 % do churrasco)", () => {
    expect(lerOfertaDoNome("bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerOfertaDoNome("[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]")).toEqual(sem(MOTIVO_SEM_CODIGO));
  });

  it("`ofmix` NÃO é código de oferta — é null com o motivo 'oferta mista'", () => {
    expect(lerOfertaDoNome("bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_lpa")).toEqual(sem(MOTIVO_OFERTA_MISTA));
  });

  it("`ofmix` junto de um `ofNN` é ambíguo, não uma das duas", () => {
    expect(lerOfertaDoNome("bbe_a01_x_of01_ofmix")).toEqual(sem(MOTIVO_MAIS_DE_UM_CODIGO));
  });

  it("dois códigos distintos → mais de um código; `of1` e `of01` são o mesmo", () => {
    expect(lerOfertaDoNome("bbe_a01_x_of01_of02")).toEqual(sem(MOTIVO_MAIS_DE_UM_CODIGO));
    expect(lerOfertaDoNome("bbe_a01_x_of1_of01")).toEqual(ok("of01"));
  });

  it("`of` dentro de palavra não é oferta (`offer1`, `prof01`)", () => {
    expect(lerOfertaDoNome("bbe_offer1_x")).toEqual(sem(MOTIVO_SEM_CODIGO));
    expect(lerOfertaDoNome("bbe_prof01_x")).toEqual(sem(MOTIVO_SEM_CODIGO));
  });
});

describe("as duas dimensões juntas", () => {
  it("o DG de hoje é a02/of03", () => {
    expect(lerFunilEOfertaDoNome("dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa")).toEqual({
      funil: ok("a02"),
      oferta: ok("of03"),
    });
  });
});

describe("PO-12 — o parser das Legadas NÃO serve aqui (e fica intocado)", () => {
  // Documenta por que o CREATE: `sugerirClassificacao` só casa `a` + um dígito
  // na forma delimitada, exige o snapshot e nunca lê oferta.
  // Story 47.17: este teste avisou — a sugestão passou a casar `[FZA1]`. A
  // justificativa do módulo novo continua de pé (snapshot, oferta, `a01`), e a
  // forma entre colchetes agora é UMA regra nos dois (`FUNIL_ENTRE_COLCHETES`).
  const snapshot = {
    experts: [{ code: "fz", active: true }],
    produtos: [],
    funis: [{ expert: "fz", code: "a01", active: true }],
    ofertas: [{ expert: "fz", code: "of01", active: true }],
    lps: [],
    valores: [],
  };
  it("não casa `a01` e não lê oferta; `[FZA1]` casa desde a 47.17, com o mesmo código que aqui", () => {
    expect(sugerirClassificacao("[FZA1][FB/IG][LEADS]", snapshot, "fz").campos.funnel).toBe("a01");
    expect(lerFunilDoNome("[FZA1][FB/IG][LEADS]")).toEqual(ok("a01"));
    expect(sugerirClassificacao("fz_a01_x_of01", snapshot, "fz").campos.funnel).toBeUndefined();
    expect(sugerirClassificacao("fz_a1_x_of01", snapshot, "fz").campos.offer).toBeUndefined();
  });
});
