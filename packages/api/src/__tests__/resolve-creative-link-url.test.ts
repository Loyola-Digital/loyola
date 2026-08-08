import { describe, it, expect } from "vitest";
import { resolveCreativeLinkUrl, LINK_URL_RESOLVER_VERSION } from "../services/meta-ads.js";

/**
 * Story 29.43 (AC6) — a cascata de resolução da URL de destino.
 *
 * Esta é a função de que a story inteira depende, e a única cuja regressão
 * reproduziria o defeito original **em silêncio**: a cascata deixaria de achar
 * a URL, o cache gravaria `null` com o carimbo NOVO, e a tela passaria a
 * afirmar com confiança que a Meta não tem o dado. O carimbo amplifica o
 * estrago de uma regressão aqui — daí o gate QA-12 ter exigido estes testes.
 *
 * A ordem da cascata vem da medição do AC0 da 29.40, em 40 anúncios reais com
 * investimento: **0% via `link_url`, 100% via `object_story_spec`** — 75% em
 * `video_data`, 25% em `link_data`.
 */
describe("resolveCreativeLinkUrl — uma origem por vez", () => {
  it("object_story_spec.link_data.link (25% da amostra real)", () => {
    expect(
      resolveCreativeLinkUrl({
        object_story_spec: { link_data: { link: "https://lp.exemplo.com/a" } },
      }),
    ).toBe("https://lp.exemplo.com/a");
  });

  it("object_story_spec.video_data.call_to_action.value.link (75% da amostra real)", () => {
    expect(
      resolveCreativeLinkUrl({
        object_story_spec: {
          video_data: { call_to_action: { value: { link: "https://lp.exemplo.com/b" } } },
        },
      }),
    ).toBe("https://lp.exemplo.com/b");
  });

  it("asset_feed_spec.link_urls[].website_url (criativos flexíveis)", () => {
    expect(
      resolveCreativeLinkUrl({
        asset_feed_spec: { link_urls: [{ website_url: "https://lp.exemplo.com/c" }] },
      }),
    ).toBe("https://lp.exemplo.com/c");
  });

  it("link_url — o legado, que a medição achou em 0% dos anúncios atuais", () => {
    expect(resolveCreativeLinkUrl({ link_url: "https://lp.exemplo.com/d" })).toBe(
      "https://lp.exemplo.com/d",
    );
  });

  it("nenhuma origem devolve null — jamais inventa destino (GR-01)", () => {
    expect(resolveCreativeLinkUrl({})).toBeNull();
    expect(resolveCreativeLinkUrl({ object_story_spec: {} })).toBeNull();
    expect(resolveCreativeLinkUrl({ asset_feed_spec: { link_urls: [] } })).toBeNull();
    expect(resolveCreativeLinkUrl(undefined)).toBeNull();
  });
});

describe("resolveCreativeLinkUrl — a ORDEM da cascata", () => {
  // Gate QA-12: a ordem não é detalhe. `link_url` vem por último porque a
  // medição o achou vazio nos criativos atuais — se ele ganhasse de
  // `object_story_spec`, um valor legado obsoleto sobrescreveria o destino
  // real, e o erro seria invisível: a tabela mostraria uma LP, só que a errada.
  it("link_data vence link_url quando os dois existem", () => {
    expect(
      resolveCreativeLinkUrl({
        link_url: "https://legado.exemplo.com/antigo",
        object_story_spec: { link_data: { link: "https://lp.exemplo.com/atual" } },
      }),
    ).toBe("https://lp.exemplo.com/atual");
  });

  it("link_data vence video_data quando os dois existem", () => {
    expect(
      resolveCreativeLinkUrl({
        object_story_spec: {
          link_data: { link: "https://lp.exemplo.com/link" },
          video_data: { call_to_action: { value: { link: "https://lp.exemplo.com/video" } } },
        },
      }),
    ).toBe("https://lp.exemplo.com/link");
  });

  it("object_story_spec vence asset_feed_spec", () => {
    expect(
      resolveCreativeLinkUrl({
        object_story_spec: { link_data: { link: "https://lp.exemplo.com/oss" } },
        asset_feed_spec: { link_urls: [{ website_url: "https://lp.exemplo.com/afs" }] },
      }),
    ).toBe("https://lp.exemplo.com/oss");
  });

  it("asset_feed_spec vence link_url", () => {
    expect(
      resolveCreativeLinkUrl({
        link_url: "https://legado.exemplo.com/antigo",
        asset_feed_spec: { link_urls: [{ website_url: "https://lp.exemplo.com/afs" }] },
      }),
    ).toBe("https://lp.exemplo.com/afs");
  });

  it("asset_feed_spec ignora entradas sem website_url e pega a primeira válida", () => {
    expect(
      resolveCreativeLinkUrl({
        asset_feed_spec: {
          link_urls: [{}, { website_url: "https://lp.exemplo.com/valida" }],
        },
      }),
    ).toBe("https://lp.exemplo.com/valida");
  });
});

describe("LINK_URL_RESOLVER_VERSION", () => {
  // O carimbo é o que separa "a Meta não tem URL" de "o cache foi escrito por
  // código que não perguntava". Se ele voltar a 1 (ou sumir), toda linha antiga
  // volta a se passar por medição — que era o defeito de origem da story.
  it("é maior que 1 — a versão 1 é o código que não perguntava pela URL", () => {
    expect(LINK_URL_RESOLVER_VERSION).toBeGreaterThan(1);
  });
});
