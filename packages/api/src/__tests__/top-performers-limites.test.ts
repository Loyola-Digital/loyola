import { describe, it, expect } from "vitest";
import {
  CREATIVE_FETCH_LIMIT,
  idsParaBuscarCriativo,
  buildAnalyticsRow,
} from "../services/traffic-analytics.js";

/**
 * Story 18.78 — os dois limites do `top-performers`, e o CTR que caía no
 * fallback.
 *
 * Contexto medido em produção (2026-09-04, 30 dias): a etapa
 * `bbe-pr2 :: Captação Paga` tem 171 anúncios com gasto e a galeria recebia
 * 100. Como as métricas do card são somatórios do grupo, 14 dos 28 grupos
 * mostravam um Hold Rate diferente do da tabela que lê todos os anúncios.
 */

/** N anúncios de nomes distintos, já ordenados por gasto. */
const ads = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    campaignId: `ad_${i}`,
    campaignName: `Criativo ${i}`,
  }));

describe("o corte de criativos não corta os dados", () => {
  it("busca criativo de no máximo 100 anúncios", () => {
    expect(idsParaBuscarCriativo(ads(171))).toHaveLength(CREATIVE_FETCH_LIMIT);
  });

  it("são os PRIMEIROS da ordenação — os de maior gasto quando metric=spend", () => {
    const ids = idsParaBuscarCriativo(ads(171));
    expect(ids[0]).toBe("ad_0");
    expect(ids[CREATIVE_FETCH_LIMIT - 1]).toBe(`ad_${CREATIVE_FETCH_LIMIT - 1}`);
  });

  it("com menos anúncios que o teto, busca todos", () => {
    expect(idsParaBuscarCriativo(ads(21))).toHaveLength(21);
  });

  it("o líder de cada nome entra ANTES de um segundo anúncio de nome já visto", () => {
    // O caso real: 100 anúncios de um punhado de nomes ocupam todo o teto, e o
    // grupo cujo líder está na posição 101 fica sem miniatura — 2 dos 30 cards
    // do bbe-pr2. A galeria mostra a imagem do anúncio de maior gasto do
    // grupo, então é ELE que precisa do criativo.
    const muitasCopias = [
      ...Array.from({ length: CREATIVE_FETCH_LIMIT }, (_, i) => ({
        campaignId: `copia_${i}`,
        campaignName: "Criativo popular", // um nome só, ocupando o teto inteiro
      })),
      { campaignId: "lider_do_outro_grupo", campaignName: "Criativo raro" },
    ];
    const ids = idsParaBuscarCriativo(muitasCopias);
    expect(ids).toContain("lider_do_outro_grupo");
    expect(ids).toHaveLength(CREATIVE_FETCH_LIMIT);
  });

  it("não repete o mesmo ad_id", () => {
    const ids = idsParaBuscarCriativo(ads(171));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("os anúncios além do teto continuam na lista — só ficam sem miniatura", () => {
    // Este é o AC: a lista que o cliente recebe é `topAds`, e ela não passa
    // por `idsParaBuscarCriativo`. Se um dia alguém voltar a usar o mesmo
    // `slice` para as duas coisas, o Hold Rate do card volta a divergir.
    const todos = ads(171);
    const paraCriativo = idsParaBuscarCriativo(todos);
    expect(todos.length).toBe(171);
    expect(todos.length).toBeGreaterThan(paraCriativo.length);
  });
});

describe("buildAnalyticsRow repassa os cliques no link", () => {
  const linha = (linkClicks: number | null) =>
    buildAnalyticsRow(
      "ad_1",
      "Anúncio",
      /* spend */ 100,
      /* impressions */ 1000,
      /* clicks */ 80, // cliques em QUALQUER lugar do anúncio — o antigo fallback
      /* entityLeads */ null,
      /* qualLeads */ null,
      /* saleData */ null,
      /* reach */ 500,
      linkClicks,
    );

  it("sem link_click, CTR e CPC são null — não viram cliques totais", () => {
    const r = linha(null);
    expect(r.ctr).toBeNull();
    expect(r.cpc).toBeNull();
    // Com o fallback de volta, `ctr` seria 8 (80 ÷ 1000 × 100) e o card do Top
    // Criativos continuaria mostrando `—` para o mesmo anúncio.
    expect(r.ctr).not.toBe(8);
  });

  it("com link_click, CTR sai dos cliques no LINK", () => {
    const r = linha(20);
    expect(r.ctr).toBeCloseTo(2, 10); // 20 ÷ 1000 × 100 — não 8
    expect(r.cpc).toBeCloseTo(5, 10); // 100 ÷ 20 — não 1,25
  });

  it("zero medido continua zero no CTR (e null no CPC, sem denominador)", () => {
    const r = linha(0);
    expect(r.ctr).toBe(0);
    expect(r.cpc).toBeNull();
  });
});
