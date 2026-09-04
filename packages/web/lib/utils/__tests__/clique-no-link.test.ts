/**
 * Story 18.78 — CTR/CPC de clique no link, a fonte única do produto.
 *
 * Os testes vivem aqui (e não em `packages/shared`, que não tem runner) porque
 * o vitest do web já resolve o subpath do shared — é o mesmo caminho de import
 * que a galeria e o Detalhamento usam em produção.
 *
 * O que cada caso protege é a distinção que três cópias divergentes apagaram:
 * `null` = a Meta não devolveu `link_click`; `0` = veio e foi zero.
 */
import {
  ctrDeLink,
  cpcDeLink,
  somarLinkClicks,
} from "@loyola-x/shared/src/clique-no-link";

describe("ctrDeLink", () => {
  it("é cliques no link ÷ impressões × 100", () => {
    expect(ctrDeLink(50, 1000)).toBeCloseTo(5, 10);
  });

  it("sem link_click devolve null — NUNCA cai em cliques totais", () => {
    // O defeito que a story corrige: `buildAnalyticsRow` e o merge de cópias
    // do Detalhamento devolviam `clicks / impressions` aqui, e a mesma tela
    // mostrava `—` no card e um percentual na tabela ao lado.
    expect(ctrDeLink(null, 1000)).toBeNull();
    expect(ctrDeLink(undefined, 1000)).toBeNull();
  });

  it("zero MEDIDO continua zero", () => {
    expect(ctrDeLink(0, 1000)).toBe(0);
  });

  it("sem impressões devolve null, não divisão por zero", () => {
    expect(ctrDeLink(10, 0)).toBeNull();
  });
});

describe("cpcDeLink", () => {
  it("é investimento ÷ cliques no link", () => {
    expect(cpcDeLink(40, 100)).toBeCloseTo(2.5, 10);
  });

  it("sem link_click devolve null", () => {
    expect(cpcDeLink(null, 100)).toBeNull();
  });

  it("zero clique devolve null, não infinito", () => {
    expect(cpcDeLink(0, 100)).toBeNull();
  });
});

describe("somarLinkClicks", () => {
  it("soma só quem tem a métrica", () => {
    expect(
      somarLinkClicks([{ linkClicks: 10 }, { linkClicks: null }, { linkClicks: 5 }]),
    ).toBe(15);
  });

  it("devolve null quando NENHUM membro tem a métrica", () => {
    expect(somarLinkClicks([{ linkClicks: null }, { linkClicks: undefined }])).toBeNull();
  });

  it("um membro com zero medido mantém o grupo em zero, não em null", () => {
    // `0` aqui significa "a Meta reportou, e ninguém clicou". Se isto virasse
    // `null`, o card diria "não medimos" sobre um anúncio medido.
    expect(somarLinkClicks([{ linkClicks: 0 }, { linkClicks: null }])).toBe(0);
  });

  it("grupo vazio é null", () => {
    expect(somarLinkClicks([])).toBeNull();
  });
});
