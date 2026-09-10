/**
 * Story 47.9 — `buildVslName` e `parseVslName` (AC5). Módulo do `shared`,
 * testado aqui porque o `shared` não tem runner.
 */
import { describe, expect, it } from "vitest";
import { CAMPOS_DA_VSL, ORDEM_DA_VSL, PREFIXO_DA_VARIAVEL, PREFIXO_VSL, TIPO_DE_CODIGO_DA_VARIAVEL, buildVslName, normalizarCodigo, parseVslName, pedacosDaVsl, proximoCodigoNumerado, type VslSnapshot } from "@loyola-x/shared";

const snap = (): VslSnapshot => ({
  experts: [
    { code: "dg", active: true },
    { code: "bbe", active: true },
  ],
  produtos: [
    { expert: "dg", slug: "claude-negocios", active: true },
    { expert: "bbe", slug: "churrasco", active: true },
  ],
  ofertas: [
    { expert: "dg", code: "of01", active: true },
    { expert: "dg", code: "of02", active: false },
  ],
  variaveis: [
    { expert: "dg", type: "lead", code: "lead02", active: true },
    { expert: "dg", type: "problem", code: "pr01", active: true },
    { expert: "dg", type: "solution", code: "sol01", active: true },
    { expert: "dg", type: "solution", code: "sol02", active: false },
    { expert: "bbe", type: "lead", code: "lead02", active: true },
  ],
});

const CAMPOS = { expert: "dg", product: "claude-negocios", lead: "lead02", problem: "pr01", solution: "sol01", offer: "of01" };
const NOME = "vsl_dg_claude-negocios_lead02_pr01_sol01_of01";

describe("código das variáveis: sigla + NN por (expert, tipo) — decisão do dono em 2026-09-10", () => {
  it("lead01 / pr01 / sol01: o formato é da sigla do tipo; texto livre e a sigla de outro tipo são rejeitados", () => {
    expect(PREFIXO_DA_VARIAVEL).toEqual({ lead: "lead", problem: "pr", solution: "sol" });
    expect(normalizarCodigo("Lead01", TIPO_DE_CODIGO_DA_VARIAVEL.lead)).toEqual({ ok: true, valor: "lead01" });
    expect(normalizarCodigo("pr01", TIPO_DE_CODIGO_DA_VARIAVEL.problem).ok).toBe(true);
    expect(normalizarCodigo("sol01", TIPO_DE_CODIGO_DA_VARIAVEL.solution).ok).toBe(true);
    expect(normalizarCodigo("demissao", TIPO_DE_CODIGO_DA_VARIAVEL.lead).ok).toBe(false);
    expect(normalizarCodigo("lead01", TIPO_DE_CODIGO_DA_VARIAVEL.problem).ok).toBe(false);
    expect(normalizarCodigo("01", TIPO_DE_CODIGO_DA_VARIAVEL.lead).ok).toBe(false);
  });
  it("sugestão é o menor livre com a sigla, inativos inclusos", () => {
    expect(proximoCodigoNumerado("lead", ["lead01", "lead03"])).toBe("lead02");
    expect(proximoCodigoNumerado("pr", [])).toBe("pr01");
    expect(proximoCodigoNumerado("sol", ["sol01"])).toBe("sol02");
  });
});

describe("template da VSL", () => {
  it("sete posições, prefixo vsl, oferta por último (D19: a oferta é o pitch)", () => {
    expect(ORDEM_DA_VSL).toEqual(["prefix", "expert", "product", "lead", "problem", "solution", "offer"]);
    expect(CAMPOS_DA_VSL).toEqual(["expert", "product", "lead", "problem", "solution", "offer"]);
    expect(PREFIXO_VSL).toBe("vsl");
  });
});

describe("buildVslName", () => {
  it("monta vsl_expert_produto_lead_problema_solucao_oferta", () => {
    expect(buildVslName(CAMPOS)).toBe(NOME);
  });
  it("lança nomeando a posição: vazio, caractere fora de [a-z0-9-]", () => {
    expect(() => buildVslName({ ...CAMPOS, lead: "" })).toThrow(/campo 4 \(lead\): vazio/);
    expect(() => buildVslName({ ...CAMPOS, problem: "falta_de_metodo" })).toThrow(/campo 5 \(problema\)/);
    expect(() => buildVslName({ ...CAMPOS, solution: "Agente" })).toThrow(/campo 6 \(solução\)/);
    expect(() => buildVslName({ ...CAMPOS, offer: "OF01" })).toThrow(/campo 7 \(oferta\)/);
  });
  it("pedacosDaVsl: sete pedaços, prefixo nunca falta, blocos por posição", () => {
    const p = pedacosDaVsl({ expert: "dg" });
    expect(p).toHaveLength(7);
    expect(p[0]).toMatchObject({ campo: "prefix", valor: "vsl", bloco: "prefixo", faltando: false });
    expect(p[1]).toMatchObject({ campo: "expert", bloco: "identidade", faltando: false });
    expect(p[3]).toMatchObject({ campo: "lead", bloco: "angulo", faltando: true });
    expect(p[6]).toMatchObject({ campo: "offer", bloco: "identidade", faltando: true });
  });
});

describe("parseVslName", () => {
  it("nome válido devolve os seis campos e sete partes", () => {
    const r = parseVslName(NOME, snap());
    expect(r).toMatchObject({ valid: true, errors: [], fields: CAMPOS });
    expect(r.partes).toHaveLength(7);
  });
  it("prefixo diferente de vsl é erro no campo 1", () => {
    expect(parseVslName("ad_dg_claude-negocios_lead02_pr01_sol01_of01", snap()).errors).toContain('campo 1 (prefixo): "ad" — o nome de VSL começa com "vsl"');
  });
  it("contagem errada aponta 6 separadores / 7 campos e não segue", () => {
    const r = parseVslName("vsl_dg_claude-negocios_lead02_pr01_sol01", snap());
    expect(r.errors).toEqual(['esperados 6 separadores "_" (7 campos), encontrados 5 (6 campos)']);
  });
  it("variável é POR EXPERT e POR TIPO: lead02 existe como lead do dg, não como problema; bbe não tem sol01", () => {
    expect(parseVslName("vsl_dg_claude-negocios_lead02_lead02_sol01_of01", snap()).errors).toContain('campo 5 (problema): "lead02" não está cadastrado para dg');
    const r = parseVslName("vsl_bbe_churrasco_lead02_pr01_sol01_of01", snap());
    expect(r.errors).toContain('campo 5 (problema): "pr01" não está cadastrado para bbe');
    expect(r.errors).toContain('campo 7 (oferta): "of01" não está cadastrada para bbe');
  });
  it("inativo é VÁLIDO com aviso (regra 4)", () => {
    const r = parseVslName("vsl_dg_claude-negocios_lead02_pr01_sol02_of02", snap());
    expect(r.valid).toBe(true);
    expect(r.avisos).toEqual(["campo 6 (solução): sol02 está inativo", "campo 7 (oferta): of02 está inativa"]);
  });
  it("maiúscula, caractere fora de [a-z0-9-] e vazio são estruturais", () => {
    expect(parseVslName("VSL_dg_claude-negocios_lead02_pr01_sol01_of01", snap()).errors.some((e) => /maiúscula/.test(e))).toBe(true);
    expect(parseVslName("vsl_dg_claude negocios_lead02_pr01_sol01_of01", snap()).errors).toContain('campo 3 (produto): "claude negocios" fora de [a-z0-9-]');
    expect(parseVslName("", snap())).toMatchObject({ valid: false, errors: ["nome vazio"] });
  });
  it("build → parse fecha o ciclo", () => {
    expect(parseVslName(buildVslName(CAMPOS), snap()).fields).toEqual(CAMPOS);
  });
});
