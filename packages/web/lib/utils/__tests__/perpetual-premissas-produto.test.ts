// Story 29.50 (AC6) — os cinco casos do AC, sobre as regras puras.
import { describe, it, expect } from "vitest";
import {
  proporPremissas,
  aplicarProposta,
  detectarDivergencia,
} from "@/lib/utils/perpetual-premissas-produto";
import type { PerpetualProduct } from "@loyola-x/shared";

const p = (name: string, type: PerpetualProduct["type"], count = 1): PerpetualProduct => ({
  name,
  count,
  type,
});

describe("proporPremissas", () => {
  // AC6.1
  it("1 principal + 2 bumps propoe os tres valores", () => {
    const r = proporPremissas([
      p("Workshop do Netão", "principal", 120),
      p("Combo de Facas", "order_bump", 30),
      p("E-book Cortes", "order_bump", 12),
      p("Mentoria Pro", "upsell", 4),
    ]);
    expect(r.produto).toBe("Workshop do Netão");
    expect(r.produtosOrderBump).toEqual(["Combo de Facas", "E-book Cortes"]);
    expect(r.ambiguo).toBe(false);
  });

  // AC6.2 — escolher o primeiro produziria um relatorio certo na aparencia e
  // errado no numero, sem o gestor saber que houve escolha.
  it("2 principais nao escolhe; devolve os candidatos e marca ambiguo", () => {
    const r = proporPremissas([p("Curso A", "principal"), p("Curso B", "principal")]);
    expect(r.produto).toBeNull();
    expect(r.ambiguo).toBe(true);
    expect(r.candidatosPrincipal).toEqual(["Curso A", "Curso B"]);
  });

  // AC6.3
  it("sem classificacao devolve vazio, sem erro", () => {
    const r = proporPremissas([]);
    expect(r).toEqual({
      produto: null,
      candidatosPrincipal: [],
      produtosOrderBump: [],
      ambiguo: false,
    });
  });

  it("upsell nao entra em order bump", () => {
    const r = proporPremissas([p("X", "principal"), p("Mentoria", "upsell")]);
    expect(r.produtosOrderBump).toEqual([]);
  });
});

describe("aplicarProposta", () => {
  const proposta = proporPremissas([
    p("Workshop", "principal"),
    p("Combo", "order_bump"),
  ]);

  it("preenche campo vazio", () => {
    const r = aplicarProposta({ produto: null, produtosOrderBump: [] }, proposta);
    expect(r.produto).toBe("Workshop");
    expect(r.produtosOrderBump).toEqual(["Combo"]);
    expect([r.preencheuProduto, r.preencheuBumps]).toEqual([true, true]);
  });

  // AC6.4 — o gestor pode ter ajustado de proposito.
  it("config ja salva NAO e sobrescrita", () => {
    const r = aplicarProposta(
      { produto: "Outro Produto", produtosOrderBump: ["Bump Antigo"] },
      proposta,
    );
    expect(r.produto).toBe("Outro Produto");
    expect(r.produtosOrderBump).toEqual(["Bump Antigo"]);
    expect([r.preencheuProduto, r.preencheuBumps]).toEqual([false, false]);
  });

  it("string so com espaco conta como vazia", () => {
    const r = aplicarProposta({ produto: "   ", produtosOrderBump: [] }, proposta);
    expect(r.produto).toBe("Workshop");
  });

  it("os dois campos sao independentes", () => {
    const r = aplicarProposta({ produto: "Meu Produto", produtosOrderBump: [] }, proposta);
    expect(r.produto).toBe("Meu Produto");
    expect(r.produtosOrderBump).toEqual(["Combo"]);
  });

  it("proposta ambigua nao preenche o produto", () => {
    const ambigua = proporPremissas([p("A", "principal"), p("B", "principal")]);
    const r = aplicarProposta({ produto: null, produtosOrderBump: [] }, ambigua);
    expect(r.produto).toBeNull();
    expect(r.preencheuProduto).toBe(false);
  });
});

describe("detectarDivergencia", () => {
  const proposta = proporPremissas([
    p("Workshop do Netão", "principal"),
    p("Combo de Facas", "order_bump"),
  ]);

  // AC6.5
  it("valor digitado diferente do classificado sinaliza divergencia", () => {
    const d = detectarDivergencia(
      { produto: "Curso Antigo", produtosOrderBump: ["Combo de Facas"] },
      proposta,
    );
    expect(d.produto).toBe(true);
    expect(d.bumps).toBe(false);
  });

  // Sinalizar acento/caixa treinaria o gestor a ignorar o aviso.
  it("diferenca de caixa ou espaco NAO e divergencia", () => {
    const d = detectarDivergencia(
      { produto: "  workshop do netão ", produtosOrderBump: ["COMBO DE FACAS"] },
      proposta,
    );
    expect(d).toEqual({ produto: false, bumps: false });
  });

  it("campo vazio nunca diverge — vazio e ausencia, nao discordancia", () => {
    const d = detectarDivergencia({ produto: null, produtosOrderBump: [] }, proposta);
    expect(d).toEqual({ produto: false, bumps: false });
  });

  it("lista de bumps com item a mais diverge", () => {
    const d = detectarDivergencia(
      { produto: null, produtosOrderBump: ["Combo de Facas", "Bump Fantasma"] },
      proposta,
    );
    expect(d.bumps).toBe(true);
  });

  it("sem classificacao nenhuma, nada diverge", () => {
    const vazia = proporPremissas([]);
    const d = detectarDivergencia({ produto: "Qualquer", produtosOrderBump: ["X"] }, vazia);
    expect(d.produto).toBe(false);
    expect(d.bumps).toBe(true); // ha bump digitado e nenhum classificado
  });
});
