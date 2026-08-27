import { describe, it, expect } from "vitest";
import {
  precisaRecarimbar,
  CREATIVE_RESOLVERS,
  LINK_URL_RESOLVER_VERSION,
  AD_PERMALINK_RESOLVER_VERSION,
  IG_PERMALINK_RESOLVER_VERSION,
} from "../services/meta-ads.js";

/**
 * Story 29.67 (AC6) — quem precisa ser rebuscado.
 *
 * O defeito que estes testes prendem já aconteceu DUAS vezes:
 *
 * - a 36.8 adicionou `adPermalinkResolver` → 27% do cache do DG & CPDF ficou
 *   sem carimbo;
 * - a 29.63 adicionou `igPermalinkResolver` → 18 anúncios ficaram de fora, com
 *   o dado disponível na Meta o tempo todo (10 de 10 conferidos).
 *
 * Nos dois casos a falha foi silenciosa: campo `null`, tela mostrando "—", e
 * ninguém distinguindo "não temos" de "não perguntamos".
 */

/** Um criativo em dia com TODOS os resolvers atuais. */
const emDia = Object.fromEntries(
  CREATIVE_RESOLVERS.map(({ carimbo, versao }) => [carimbo, versao]),
);

describe("precisaRecarimbar", () => {
  it("criativo em dia com todos os resolvers NÃO é rebuscado", () => {
    // É o que garante o AC2: em regime, rodar de novo busca zero.
    expect(precisaRecarimbar(emDia)).toBe(false);
  });

  it("criativo ausente do cache é o caso mais desatualizado que existe", () => {
    expect(precisaRecarimbar(null)).toBe(true);
    expect(precisaRecarimbar(undefined)).toBe(true);
    expect(precisaRecarimbar({})).toBe(true);
  });

  it("carimbo AUSENTE conta como versão 0, não como 'em dia'", () => {
    // Foi exatamente este o estado dos 18 anúncios do DG: `igPermalinkResolver`
    // null. Tratar ausência como atual os deixaria de fora para sempre.
    for (const { carimbo } of CREATIVE_RESOLVERS) {
      const semUm = { ...emDia };
      delete (semUm as Record<string, unknown>)[carimbo];
      expect(precisaRecarimbar(semUm)).toBe(true);
    }
  });

  it("carimbo ANTERIOR à versão atual pede rebusca", () => {
    for (const { carimbo, versao } of CREATIVE_RESOLVERS) {
      expect(precisaRecarimbar({ ...emDia, [carimbo]: versao - 1 })).toBe(true);
    }
  });

  it("valor não-numérico no carimbo pede rebusca em vez de estourar", () => {
    expect(precisaRecarimbar({ ...emDia, linkUrlResolver: "dois" })).toBe(true);
    expect(precisaRecarimbar({ ...emDia, igPermalinkResolver: null })).toBe(true);
  });

  // ── Teste DIFERENCIAL ──────────────────────────────────────────────────
  // Este é o que quebra se alguém adicionar um resolver e esquecer da lista.

  it("a lista cobre TODOS os resolvers exportados — o defeito que se repetiu 2x", () => {
    const naLista = CREATIVE_RESOLVERS.map((r) => r.carimbo).sort();
    expect(naLista).toEqual(
      ["adPermalinkResolver", "igPermalinkResolver", "linkUrlResolver"].sort(),
    );
    // E as versões são as constantes de verdade, não números copiados à mão —
    // copiar criaria duas fontes que divergem no próximo incremento.
    const porNome = Object.fromEntries(CREATIVE_RESOLVERS.map((r) => [r.carimbo, r.versao]));
    expect(porNome.linkUrlResolver).toBe(LINK_URL_RESOLVER_VERSION);
    expect(porNome.adPermalinkResolver).toBe(AD_PERMALINK_RESOLVER_VERSION);
    expect(porNome.igPermalinkResolver).toBe(IG_PERMALINK_RESOLVER_VERSION);
  });

  it("incrementar QUALQUER versão invalida o criativo que estava em dia", () => {
    // Simula o dia em que um campo novo entra: o cache inteiro fica devendo.
    // É o comportamento desejado — e é por isso que o teto do AC2 existe.
    for (const { carimbo, versao } of CREATIVE_RESOLVERS) {
      const futuro = { ...emDia, [carimbo]: versao };
      expect(precisaRecarimbar(futuro)).toBe(false);
      // com a versão do código adiante do carimbo gravado:
      expect(precisaRecarimbar({ ...futuro, [carimbo]: versao - 1 })).toBe(true);
    }
  });
});
