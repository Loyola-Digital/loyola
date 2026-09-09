/**
 * Story 47.1 — as regras puras do dicionário (spec § 3 e § 5).
 *
 * Cada `it` falha com a regra revertida — a tabela de reversão está no Change
 * Log da story.
 */
import { describe, expect, it } from "vitest";
import {
  montarSlugDeLp,
  normalizarCodigo,
  proximoCodigoDeLp,
  proximoCodigoNumerado,
} from "@loyola-x/shared";
import {
  ErroDeNomenclatura,
  codigoValidado,
  conflitoDeCodigo,
  exigirMesmoExpert,
  exigirNaoUsado,
  exigirSemReferencias,
  podeAcessar,
  rotuloDe,
  sugerirCodigo,
} from "../services/nomenclatura/regras.js";

describe("normalizarCodigo — spec § 5 e AC 14", () => {
  it('"Churrasco Premium" vira churrasco-premium', () => {
    expect(normalizarCodigo("Churrasco Premium", "produto")).toEqual({ ok: true, valor: "churrasco-premium" });
  });
  it('"churrasco_premium" é rejeitado (o _ separa campos do nome)', () => {
    const r = normalizarCodigo("churrasco_premium", "produto");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/_/);
  });
  it("tira acento e caixa: 'Açaí Bowl' → acai-bowl", () => {
    expect(normalizarCodigo("  Açaí Bowl ", "produto")).toEqual({ ok: true, valor: "acai-bowl" });
  });
  it("rejeita '--' e '-' nas pontas", () => {
    expect(normalizarCodigo("a--b", "produto").ok).toBe(false);
    expect(normalizarCodigo("-ab", "produto").ok).toBe(false);
    expect(normalizarCodigo("ab-", "produto").ok).toBe(false);
  });
  it("valida o formato por tipo", () => {
    expect(normalizarCodigo("BBE", "expert")).toEqual({ ok: true, valor: "bbe" });
    expect(normalizarCodigo("b", "expert").ok).toBe(false);
    expect(normalizarCodigo("bbeee", "expert").ok).toBe(false);
    expect(normalizarCodigo("A01", "funil")).toEqual({ ok: true, valor: "a01" });
    expect(normalizarCodigo("a1", "funil").ok).toBe(false);
    expect(normalizarCodigo("of07", "oferta").ok).toBe(true);
    expect(normalizarCodigo("o07", "oferta").ok).toBe(false);
    expect(normalizarCodigo("lpa", "lp").ok).toBe(true);
    expect(normalizarCodigo("lp1", "lp").ok).toBe(false);
    expect(normalizarCodigo("carrossel", "valor").ok).toBe(true);
    expect(normalizarCodigo("est-aticos", "valor").ok).toBe(false);
  });
  it("produto passa de 20 caracteres → rejeita", () => {
    expect(normalizarCodigo("a".repeat(21), "produto").ok).toBe(false);
  });
  it("codigoValidado lança 400 nomeando o campo", () => {
    expect(() => codigoValidado("churrasco_premium", "produto", "slug")).toThrow(ErroDeNomenclatura);
    try {
      codigoValidado("churrasco_premium", "produto", "slug");
    } catch (e) {
      const erro = e as ErroDeNomenclatura;
      expect(erro.status).toBe(400);
      expect(erro.corpo()).toMatchObject({ campo: "slug" });
      expect(erro.message.startsWith("slug:")).toBe(true);
    }
  });
});

describe("sugestão de código — spec § 5 e AC 5", () => {
  it("com of01 e of02 sugere of03", () => {
    expect(proximoCodigoNumerado("of", ["of01", "of02"])).toBe("of03");
    expect(sugerirCodigo("oferta", ["of01", "of02"])).toBe("of03");
  });
  it("inativos contam: o menor livre, não o maior + 1", () => {
    expect(proximoCodigoNumerado("a", ["a01", "a03"])).toBe("a02");
  });
  it("sequência esgotada devolve null", () => {
    const todos = Array.from({ length: 99 }, (_, i) => `of${String(i + 1).padStart(2, "0")}`);
    expect(proximoCodigoNumerado("of", todos)).toBeNull();
  });
  it("LP: lpa → lpb; sem nada → lpa", () => {
    expect(proximoCodigoDeLp([])).toBe("lpa");
    expect(proximoCodigoDeLp(["lpa"])).toBe("lpb");
    expect(sugerirCodigo("lp", ["lpa", "lpb"])).toBe("lpc");
  });
});

describe("mensagem de conflito — spec § 5", () => {
  it("cita a descrição do que já ocupa e sugere o próximo", () => {
    const e = conflitoDeCodigo({ codigo: "of02", escopo: "bbe", descricaoExistente: "oferta com ticket médio de R$ 297", sugestao: "of03", campo: "code" });
    expect(e.status).toBe(409);
    expect(e.message).toBe('of02 já existe para bbe: "oferta com ticket médio de R$ 297". Use of03.');
    expect(e.corpo()).toMatchObject({ campo: "code", sugestao: "of03" });
  });
  it("sem sugestão (expert, produto, valor) não inventa 'Use …'", () => {
    const e = conflitoDeCodigo({ codigo: "bbe", escopo: "a base", descricaoExistente: "Netão", sugestao: null, campo: "code" });
    expect(e.message).toBe('bbe já existe para a base: "Netão".');
  });
});

describe("slug da LP — spec § 4.5", () => {
  it("bbe/churrasco/a01/of01/lpa → bbe-churrasco-a01-of01-lpa", () => {
    expect(montarSlugDeLp({ expert: "bbe", produto: "churrasco", funil: "a01", oferta: "of01", lp: "lpa" })).toBe("bbe-churrasco-a01-of01-lpa");
  });
});

describe("imutabilidade, exclusão, coerência — spec § 5", () => {
  it("usado → 409 com usadoEm e o texto da tela", () => {
    expect(() => exigirNaoUsado(0, "code")).not.toThrow();
    try {
      exigirNaoUsado(3, "code");
      throw new Error("devia ter lançado");
    } catch (e) {
      const erro = e as ErroDeNomenclatura;
      expect(erro.status).toBe(409);
      expect(erro.corpo()).toMatchObject({ usadoEm: 3, campo: "code" });
      expect(erro.message).toBe("Usado em 3 campanha(s). Para mudar o significado, crie um código novo.");
    }
  });
  it("referenciado → 409 com a lista e podeDesativar", () => {
    const refs = [
      { tipo: "lp" as const, id: "1", rotulo: "bbe-churrasco-a01-of01-lpa" },
      { tipo: "campanha" as const, id: "2", rotulo: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa" },
      { tipo: "campanha" as const, id: "3", rotulo: "bbe_churrasco_a01_of01_2026_cold_cbo_videos_lpa" },
    ];
    expect(() => exigirSemReferencias([])).not.toThrow();
    try {
      exigirSemReferencias(refs);
      throw new Error("devia ter lançado");
    } catch (e) {
      const erro = e as ErroDeNomenclatura;
      expect(erro.status).toBe(409);
      expect(erro.corpo()).toMatchObject({ podeDesativar: true, referencias: refs });
      expect(erro.message).toContain("1 lp");
      expect(erro.message).toContain("2 campanhas");
    }
  });
  it("produto de outro expert → 422 nomeando o campo; inexistente → 404", () => {
    expect(() => exigirMesmoExpert("e1", [{ campo: "productId", expertId: "e1", rotulo: "produto" }])).not.toThrow();
    try {
      exigirMesmoExpert("e1", [{ campo: "productId", expertId: "e2", rotulo: "produto" }]);
      throw new Error("devia ter lançado");
    } catch (e) {
      expect((e as ErroDeNomenclatura).status).toBe(422);
      expect((e as ErroDeNomenclatura).corpo()).toMatchObject({ campo: "productId" });
    }
    try {
      exigirMesmoExpert("e1", [{ campo: "funnelId", expertId: undefined, rotulo: "funil" }]);
      throw new Error("devia ter lançado");
    } catch (e) {
      expect((e as ErroDeNomenclatura).status).toBe(404);
    }
  });
  it("rótulo dos selects é `código — descrição`", () => {
    expect(rotuloDe("of01", "oferta com ticket médio de R$ 347")).toBe("of01 — oferta com ticket médio de R$ 347");
  });
  it("guest não acessa; os outros papéis sim (D3)", () => {
    expect(podeAcessar("guest")).toBe(false);
    expect(podeAcessar(undefined)).toBe(false);
    for (const r of ["copywriter", "strategist", "manager", "admin"]) expect(podeAcessar(r)).toBe(true);
  });
});
