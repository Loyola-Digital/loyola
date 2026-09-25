/**
 * Story 47.5 — filtro e sugestão de classificação de campanhas legadas, sobre
 * a AMOSTRA REAL de produção (12 nomes, 2026-09-09) e os contraexemplos.
 */
import { describe, expect, it } from "vitest";
import { FUNIL_ENTRE_COLCHETES, REGEX_LEGADA_SQL, ehCandidataALegada, lerFunilDoNome, sugerirClassificacao, type DicionarioSnapshot } from "@loyola-x/shared";

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

describe("Story 47.17 — a sigla entre colchetes (`[FZA1]`) entra na fila e na sugestão", () => {
  // Os 4 nomes reais de `meta_entity_names_cache` que a regra da 47.5 deixava
  // de fora (medidos em produção em 2026-09-23; as 2 do FZ somam R$ 7.938,38).
  const COLCHETES = [
    "[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]",
    "[FZA1][FB/IG][LEADS][2025.08.25][HOT][ALL-IN-ONE]",
    "[F01][FB/IG][LEADS][2025.05.30][NORMAL][COLD][DGA1]",
    "[F01][FB/IG][LEADS][2025.05.30][ADV][COLD][ASC][DGA1]",
  ];
  // AC4: colchete com número/hífen (lançamento medido na 29.79) e o CONTRA da 47.5.
  const NEGATIVOS = ["[30-14-7-5A1]", "ba1-teste", "bbe-a10-lancamento", "[DGA1B]", "[ABCDEA1]"];
  const re = new RegExp(REGEX_LEGADA_SQL, "i");

  it("(a) os 4 nomes reais casam `ehCandidataALegada` E a expressão do SQL", () => {
    for (const n of COLCHETES) {
      expect(ehCandidataALegada(n), n).toBe(true);
      expect(re.test(n), n).toBe(true);
    }
  });

  it("(b) sem falso positivo: os negativos do AC4 seguem fora, nos dois lados", () => {
    for (const n of NEGATIVOS) {
      expect(ehCandidataALegada(n), n).toBe(false);
      expect(re.test(n), n).toBe(false);
    }
  });

  it("o que casava continua casando (as 12 da AMOSTRA) e o CONTRA segue fora", () => {
    for (const n of AMOSTRA) expect(re.test(n), n).toBe(true);
    for (const n of CONTRA) expect(re.test(n), n).toBe(false);
  });

  it("sem caixa: `[fza1]` e `[FzA10]` casam; sigla de 2 a 4 letras", () => {
    for (const n of ["[fza1]", "[FzA10] x", "[DGA1]", "[ABCDA2]"]) expect(ehCandidataALegada(n), n).toBe(true);
  });

  it("UMA definição: a forma entre colchetes está DENTRO da expressão da fila, sem cópia", () => {
    expect(REGEX_LEGADA_SQL.endsWith(`|${FUNIL_ENTRE_COLCHETES}`)).toBe(true);
    // Válida no Postgres: nada de `\\d` (ARE aceita, mas `[0-9]` não depende de locale).
    expect(FUNIL_ENTRE_COLCHETES).not.toContain("\\d");
  });

  it("(c) sugestão: `[FZA1]` + expert do projeto → funil a01, confiança média", () => {
    for (const n of COLCHETES.slice(0, 2)) {
      const s = sugerirClassificacao(n, snap(), "fz");
      expect(s.campos.funnel, n).toBe("a01");
      expect(s.confianca.funnel, n).toBe("media");
    }
  });

  it("(c) PO-05: `[FZA10]` → a10, nunca a010 (e não cadastrado vira aviso)", () => {
    const d = snap();
    d.funis.push({ expert: "fz", code: "a10", active: true });
    expect(sugerirClassificacao("[FZA10][FB/IG][LEADS]", d, "fz").campos.funnel).toBe("a10");
    const sem = sugerirClassificacao("[FZA10][FB/IG][LEADS]", snap(), "fz");
    expect(sem.campos.funnel).toBeUndefined();
    expect(sem.naoCadastrado).toContain("funil a10 de fz");
  });

  it("funil entre colchetes não cadastrado → `naoCadastrado`, como a forma delimitada", () => {
    const s = sugerirClassificacao("[F01][FB/IG][LEADS][2025.05.30][NORMAL][COLD][DGA1]", snap(), "bbe");
    expect(s.campos.funnel).toBe("a01");
    const semA01 = snap();
    semA01.funis = semA01.funis.filter((f) => !(f.expert === "bbe" && f.code === "a01"));
    expect(sugerirClassificacao("[DGA1]", semA01, "bbe").naoCadastrado).toContain("funil a01 de bbe");
  });

  it("sem `expertHint` não há sugestão de funil (o nome não tem prefixo `fz-`)", () => {
    const s = sugerirClassificacao("[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]", snap());
    expect(s.campos.expert).toBeUndefined();
    expect(s.campos.funnel).toBeUndefined();
  });

  it("a forma delimitada vem primeiro: nome que já tinha sugestão não muda de funil", () => {
    const d = snap();
    d.funis.push({ expert: "fz", code: "a02", active: true });
    expect(sugerirClassificacao("fz-a2-x [FZA1]", d, "fz").campos.funnel).toBe("a02");
  });

  it("fila, sugestão e a leitura da 29.79 concordam no funil de cada nome real", () => {
    for (const n of COLCHETES) {
      const expert = n.startsWith("[FZA1]") ? "fz" : "bbe";
      expect(sugerirClassificacao(n, snap(), expert).campos.funnel, n).toBe(lerFunilDoNome(n).codigo);
    }
  });
});
