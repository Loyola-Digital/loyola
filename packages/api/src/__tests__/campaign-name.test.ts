import { describe, it, expect } from "vitest";
import { normalizarNomeCampanha, temSufixoDeCopia } from "@loyola-x/shared";

/**
 * Story 44.4. O agrupamento por nome é heurística, e a heurística erra de dois
 * jeitos: junta o que não devia (pior) ou deixa de juntar (recuperável na
 * revisão). Os testes abaixo protegem principalmente contra o primeiro.
 */
describe("normalizarNomeCampanha", () => {
  it("normaliza caixa, acento e espaço", () => {
    expect(normalizarNomeCampanha("CAMPANHA  Ação")).toBe("campanha acao");
    expect(normalizarNomeCampanha("  Campanha X  ")).toBe("campanha x");
  });

  it("remove os sufixos de cópia que a Meta e o time usam", () => {
    for (const n of [
      "Campanha X - Cópia",
      "Campanha X - copia",
      "Campanha X - Copy",
      "Campanha X (1)",
      "Campanha X (2)",
      "Campanha X copy",
      "Campanha X — cópia",
    ]) {
      expect(normalizarNomeCampanha(n)).toBe("campanha x");
    }
  });

  /**
   * O erro que custa caro: agrupar duas campanhas diferentes. A âncora no fim
   * é o que impede.
   */
  it("NÃO come 'copy' no meio do nome", () => {
    expect(normalizarNomeCampanha("Campanha Copy Center")).toBe("campanha copy center");
    expect(normalizarNomeCampanha("Copy da Landing")).toBe("copy da landing");
    expect(normalizarNomeCampanha("Campanha (2) Escala")).toBe("campanha (2) escala");
  });

  it("nome vazio devolve vazio — não inventa rótulo", () => {
    expect(normalizarNomeCampanha("")).toBe("");
    expect(normalizarNomeCampanha(null)).toBe("");
    expect(normalizarNomeCampanha(undefined)).toBe("");
    expect(normalizarNomeCampanha("   ")).toBe("");
  });

  it("remove UM sufixo por chamada — repetição é decisão de ninguém", () => {
    // Documenta o comportamento; se o time quiser remover repetições, é decisão
    // nova e explícita, não efeito colateral do regex.
    expect(normalizarNomeCampanha("Campanha X - cópia - cópia")).toBe("campanha x - copia");
  });

  it("nomes reais de campanha do time sobrevivem inteiros", () => {
    const real = "2026-08-10_netao_bbe-pr2-out-26_venda-ingresso-bbe-escala-lp01_cold_cbo_videos-lpa";
    expect(normalizarNomeCampanha(real)).toBe(real);
  });
});

describe("temSufixoDeCopia", () => {
  it("detecta para o relatório de revisão", () => {
    expect(temSufixoDeCopia("Campanha X - Cópia")).toBe(true);
    expect(temSufixoDeCopia("Campanha X (3)")).toBe(true);
    expect(temSufixoDeCopia("Campanha Copy Center")).toBe(false);
    expect(temSufixoDeCopia("")).toBe(false);
  });
});
