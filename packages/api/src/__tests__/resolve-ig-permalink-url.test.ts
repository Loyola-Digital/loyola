import { describe, it, expect } from "vitest";
import {
  resolveIgPermalinkUrl,
  resolveAdPermalinkUrl,
  IG_PERMALINK_RESOLVER_VERSION,
} from "../services/meta-ads.js";

/**
 * Story 29.63 — permalink do post no Instagram.
 *
 * Medição que sustenta a implementação (2026-08-26, Graph API v21.0, anúncios
 * com entrega):
 *
 * | conta       | instagram_permalink_url | effective_object_story_id |
 * |-------------|-------------------------|---------------------------|
 * | BBE         | 150/150 (100,0%)        | 150/150 (100%)            |
 * | PP          | 120/125 ( 96,0%)        | 125/125 (100%)            |
 * | Lyrio       |  54/56  ( 96,4%)        |  56/56  (100%)            |
 *
 * A Meta devolve a URL PRONTA. Este resolver não monta string — normaliza o
 * vazio e serve de ponto único para o carimbo de versão.
 *
 * Acesso público verificado deslogado em 5 contas (5/5 renderizaram o post);
 * um shortcode inventado devolveu "Post não está disponível". Foi esse teste
 * que o `preview_shareable_link` da 36.8 não passou.
 */
describe("resolveIgPermalinkUrl", () => {
  it("devolve a URL que a Meta entregou, sem remontar", () => {
    // Remontar a partir de um shortcode extraído seria uma chance a mais de
    // errar sem nenhum ganho: o campo já vem no formato final.
    const url = "https://www.instagram.com/p/Dcbk1PuM3Lh/";
    expect(resolveIgPermalinkUrl({ instagram_permalink_url: url })).toBe(url);
  });

  it("anúncio sem post no Instagram devolve null", () => {
    // ~4% dos anúncios do PP e do Lyrio. Não é erro — é anúncio que só existe
    // no Facebook, e quem consome cai para `resolveAdPermalinkUrl`.
    expect(resolveIgPermalinkUrl({})).toBeNull();
    expect(resolveIgPermalinkUrl(undefined)).toBeNull();
  });

  it("string vazia vira null, nunca ''", () => {
    // `""` sobrevive a `?? null` e chega à UI como link vazio: um `<a href="">`
    // que recarrega a página. `null` cai no "—", que é honesto.
    expect(resolveIgPermalinkUrl({ instagram_permalink_url: "" })).toBeNull();
    expect(resolveIgPermalinkUrl({ instagram_permalink_url: "   " })).toBeNull();
  });

  it("o carimbo do resolver começa em 1 e existe", () => {
    // Sem ele, `igPermalinkUrl: null` de linha antiga é indistinguível de "a
    // Meta não tem" — e as duas causas pedem reações opostas de quem lê a tela.
    expect(IG_PERMALINK_RESOLVER_VERSION).toBe(1);
  });

  it("é independente do permalink do Facebook — um não cobre o outro", () => {
    // Os dois campos vêm de origens diferentes da Meta. Um anúncio pode ter só
    // o do Facebook (medido), e a cascata do consumidor depende disso.
    const soFacebook = { effective_object_story_id: "110471599611185_1633365255457373" };
    expect(resolveIgPermalinkUrl(soFacebook)).toBeNull();
    expect(resolveAdPermalinkUrl(soFacebook)).toBe(
      "https://www.facebook.com/110471599611185/posts/1633365255457373",
    );
  });

  it("NÃO usa link_url nem object_story_spec — esses são o DESTINO do clique", () => {
    // O defeito da story: confundir o link do criativo com a landing page.
    // Se alguém adicionar `link_url` à cascata deste resolver, isto quebra.
    expect(
      resolveIgPermalinkUrl({
        link_url: "https://lp.exemplo.com.br/inscricao",
        object_story_spec: { link_data: { link: "https://lp.exemplo.com.br/inscricao" } },
      }),
    ).toBeNull();
  });
});
