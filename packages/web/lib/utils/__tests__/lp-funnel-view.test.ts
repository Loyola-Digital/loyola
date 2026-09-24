/**
 * Story 18.83 (AC9, PO-11) — a visão do mini-funil, fora do hook para ser testável.
 */

import { describe, expect, it } from "vitest";
import { montarVisaoDoLpFunnel, type RespostaDoLpFunnel } from "@/lib/utils/lp-funnel-view";

const D = "lps.netaobombeef.com/bbepr2-captura-d";

const resposta = (cobertura: RespostaDoLpFunnel["cobertura"]): RespostaDoLpFunnel => ({
  semDados: false,
  lps: [
    { lp: D, variantes: [], leads: 47, aplicacoes: 0, pesquisas: 0, compras: 4, receita: 188 },
    { lp: "lps.netaobombeef.com/Captura-A", variantes: [], leads: 20, aplicacoes: 0, pesquisas: 1, compras: 3, receita: 141 },
  ],
  semLp: { leads: 26, aplicacoes: 0, pesquisas: 7, compras: 8 },
  cobertura,
  fontes: [],
});

describe("montarVisaoDoLpFunnel", () => {
  it("a fonte nova (`anuncio`) conta em `atribuidos` — tirá-la muda o pctHeranca", () => {
    // Medido no bbe-pr2 (30 dias): 61 por anúncio, 8 por herança → 11,6 %.
    // Mutação: somar só term + campanha + herança → 8 ÷ 8 = 100 %.
    const v = montarVisaoDoLpFunnel(resposta({ term: 0, campanha: 0, anuncio: 61, heranca: 8, semLp: 41 }));
    expect(v.pctHeranca).toBeCloseTo((8 / 69) * 100, 6);
  });

  it("API anterior (sem `anuncio`) segue somando as três de antes", () => {
    const v = montarVisaoDoLpFunnel(resposta({ term: 61, campanha: 0, heranca: 8, semLp: 41 }));
    expect(v.pctHeranca).toBeCloseTo((8 / 69) * 100, 6);
  });

  it("o card casa com a linha pela URL EXATA (sem maiúsculas)", () => {
    // Mutação: voltar a `lp.toUpperCase()` → a chave vira "LPS.NETAOBOMBEEF…"
    // e a tabela (que procura a URL) não acha o card.
    const v = montarVisaoDoLpFunnel(resposta({ term: 0, campanha: 0, anuncio: 1, heranca: 0, semLp: 0 }));
    expect(v.byLp[D]?.leads).toBe(47);
    expect(v.byLp["lps.netaobombeef.com/Captura-A"]?.leads).toBe(20);
  });

  it("rótulo da API anterior ('lpa') continua casando em maiúsculas", () => {
    const v = montarVisaoDoLpFunnel({
      ...resposta({ term: 1, campanha: 0, heranca: 0, semLp: 0 }),
      lps: [{ lp: "lpa", variantes: [], leads: 3, aplicacoes: 0, pesquisas: 0, compras: 1, receita: 0 }],
    });
    expect(v.byLp.LPA?.leads).toBe(3);
  });

  it("régua de conversão soma TODAS as LPs", () => {
    const v = montarVisaoDoLpFunnel(resposta({ term: 0, campanha: 0, anuncio: 1, heranca: 0, semLp: 0 }));
    expect(v.refConversao).toBeCloseTo((7 / 67) * 100, 6);
  });
});
