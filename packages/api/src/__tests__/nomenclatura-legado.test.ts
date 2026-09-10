/**
 * Story 47.5 — filtro e sugestão de classificação de campanhas legadas, sobre
 * a AMOSTRA REAL de produção (12 nomes, 2026-09-09) e os contraexemplos.
 */
import { describe, expect, it } from "vitest";
import { REGEX_LEGADA_SQL, ehCandidataALegada, sugerirClassificacao, type DicionarioSnapshot } from "@loyola-x/shared";

const AMOSTRA = [
  "bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos",
  "bbe-a1-ago-26--venda--perpetuo--cold_cbo_videos",
  "bbe-a2-ago-26--venda--perpetuo--cold_abo_vencedores",
  "bbe-a1-jul-26--venda--perpetuo--cold_cbo_vencedores",
  "pps-a1-jul-26--venda--perpetuo--cold--estaticos",
  "[VENDAS] [PERPETUO] [CPF] [FRIO] - Teste conversão na pag de vendas",
  "fz-a1-ago-26--venda--perpetuo--hot_cbo_lpd",
  "bbe-a1-jul-26--venda--perpetuo--hot_cbo_vencedores-lpe",
  "[VENDAS] [PERPETUO] [CPF] [FRIO] - Teste de e criativos",
  "pps-a1-ago-26--venda--perpetuo--cold--estaticos_lpa",
  "[VENDAS] [PERPETUO] [CPF] [FRIO] - Manutenção",
  "[VENDAS] [PERPETUO] [CPF] [FRIO] - Teste de criativos",
];
const CONTRA = ["bbe-a10-lancamento", "ba1-teste", "Campanha A1B", "bbe-lan-jul-26--captacao"];

const snap = (): DicionarioSnapshot => ({
  experts: [{ code: "bbe", active: true }, { code: "pps", active: true }, { code: "fz", active: true }],
  produtos: [{ expert: "bbe", slug: "churrasco", active: true }, { expert: "fz", slug: "hamburguer", active: true }, { expert: "fz", slug: "pizza", active: true }],
  funis: [{ expert: "bbe", code: "a01", active: true }, { expert: "bbe", code: "a02", active: false }, { expert: "fz", code: "a01", active: true }],
  ofertas: [{ expert: "bbe", code: "of01", active: true }],
  lps: [{ expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", code: "lpe", active: true }],
  valores: [
    { type: "year", value: "2026", active: true },
    { type: "temperature", value: "hot", active: true },
    { type: "temperature", value: "cold", active: true },
    { type: "auction", value: "cbo", active: true },
    { type: "auction", value: "abo", active: true },
    { type: "format", value: "videos", active: true },
    { type: "format", value: "estaticos", active: true },
  ],
});

describe("AC5 — filtro por token (a1/a2/perpetuo)", () => {
  it("os 12 nomes reais casam", () => {
    for (const n of AMOSTRA) expect(ehCandidataALegada(n), n).toBe(true);
  });
  it("substring não casa: a10, ba1, A1B, sem perpetuo", () => {
    for (const n of CONTRA) expect(ehCandidataALegada(n), n).toBe(false);
  });
  it("sem caixa e com acento: PERPÉTUO e Perpetuo casam; vazio não", () => {
    expect(ehCandidataALegada("Campanha PERPÉTUO 2025")).toBe(true);
    expect(ehCandidataALegada("perpetuo")).toBe(true);
    expect(ehCandidataALegada("")).toBe(false);
    expect(ehCandidataALegada(null)).toBe(false);
  });
  it("a expressão SQL é a mesma do TS (uma regra, dois lados)", () => {
    const re = new RegExp(REGEX_LEGADA_SQL, "i");
    for (const n of [...AMOSTRA, ...CONTRA]) expect(re.test(n)).toBe(ehCandidataALegada(n));
  });
});

describe("AC6 — sugestão só com o que existe no dicionário", () => {
  it("bbe estruturado: expert, funil a01, produto único, ano, temperatura, leilão, formato", () => {
    const s = sugerirClassificacao("bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos", snap());
    expect(s.campos).toEqual({ expert: "bbe", funnel: "a01", product: "churrasco", year: "2026", temperature: "hot", auction: "cbo", format: "estaticos" });
    expect(s.campos.offer).toBeUndefined();
    expect(s.naoCadastrado).toEqual([]);
  });
  it("`vencedores` não é formato: fica vazio e vira aviso; a2 inativo não é sugerido", () => {
    const s = sugerirClassificacao("bbe-a2-ago-26--venda--perpetuo--cold_abo_vencedores", snap());
    expect(s.campos.format).toBeUndefined();
    expect(s.campos.funnel).toBeUndefined();
    expect(s.naoCadastrado).toEqual(expect.arrayContaining(["funil a02 de bbe", "formato vencedores"]));
    expect(s.campos).toMatchObject({ expert: "bbe", temperature: "cold", auction: "abo" });
  });
  it("LP só quando existe para expert+produto+funil (lpe existe; lpd de fz não)", () => {
    expect(sugerirClassificacao("bbe-a1-jul-26--venda--perpetuo--hot_cbo_vencedores-lpe", snap()).campos.lp).toBe("lpe");
    const fz = sugerirClassificacao("fz-a1-ago-26--venda--perpetuo--hot_cbo_lpd", snap());
    expect(fz.campos.lp).toBeUndefined();
    // fz tem DOIS produtos: não chuta produto, e sem produto não resolve LP
    expect(fz.campos.product).toBeUndefined();
  });
  it("texto livre da DG: só a temperatura (FRIO → cold) e, com o projeto, o expert", () => {
    const s = sugerirClassificacao("[VENDAS] [PERPETUO] [CPF] [FRIO] - Teste de criativos", snap(), "bbe");
    expect(s.campos).toMatchObject({ temperature: "cold", expert: "bbe" });
    expect(s.confianca.expert).toBe("alta");
    expect(s.campos.funnel).toBeUndefined();
  });
  it("o expert do projeto prevalece sobre o prefixo do nome", () => {
    const s = sugerirClassificacao("bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos", snap(), "fz");
    expect(s.campos.expert).toBe("fz");
  });
  it("temperatura reconhecida mas fora do dicionário vira aviso, não sugestão (regra 8 na sugestão)", () => {
    const d = snap();
    d.valores = d.valores.filter((v) => v.value !== "cold");
    const s = sugerirClassificacao("[VENDAS] [PERPETUO] [CPF] [FRIO] - Manutenção", d);
    expect(s.campos.temperature).toBeUndefined();
    expect(s.naoCadastrado).toContain("temperatura cold");
  });
  it("ano fora do dicionário vira aviso, não sugestão", () => {
    const s = sugerirClassificacao("pps-a1-jul-25--venda--perpetuo--cold--estaticos", snap());
    expect(s.campos.year).toBeUndefined();
    expect(s.naoCadastrado).toContain("ano 2025");
  });
});
