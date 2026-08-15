import { describe, it, expect } from "vitest";
import { resolveAdPermalinkUrl, AD_PERMALINK_RESOLVER_VERSION } from "../services/meta-ads.js";

/**
 * Story 36.8 — permalink do ANÚNCIO no feed `/creatives`.
 *
 * Medição que decidiu a implementação (2026-08-14, 150 anúncios com entrega em
 * 3 contas, últimos 30 dias):
 *
 * | campo                       | cobertura |
 * |-----------------------------|-----------|
 * | `preview_shareable_link`    | 100%      |
 * | `effective_object_story_id` | 100%      |
 * | `object_story_id`           | 0%        |
 * | `link_url`                  | 0%        |
 *
 * Os dois primeiros empatam em cobertura; o desempate é o AC2 (persistibilidade).
 */
describe("resolveAdPermalinkUrl", () => {
  it("monta o permalink a partir de {pageId}_{postId}", () => {
    expect(
      resolveAdPermalinkUrl({ effective_object_story_id: "110471599611185_1633365255457373" }),
    ).toBe("https://www.facebook.com/110471599611185/posts/1633365255457373");
  });

  it("anúncio sem post associado devolve null, nunca string vazia (AC3)", () => {
    // `""` passaria em `if (link)` de forma diferente de `null` em alguns
    // consumidores e é indistinguível de "não buscamos ainda".
    expect(resolveAdPermalinkUrl({})).toBeNull();
    expect(resolveAdPermalinkUrl(undefined)).toBeNull();
    expect(resolveAdPermalinkUrl({ effective_object_story_id: "" })).toBeNull();
  });

  it("formato inesperado devolve null em vez de montar URL errada", () => {
    // Sem separador, ou com uma das metades vazia: não sabemos ler. Uma URL
    // montada daqui responderia 404 parecendo um link legítimo.
    expect(resolveAdPermalinkUrl({ effective_object_story_id: "1633365255457373" })).toBeNull();
    expect(resolveAdPermalinkUrl({ effective_object_story_id: "_1633365255457373" })).toBeNull();
    expect(resolveAdPermalinkUrl({ effective_object_story_id: "110471599611185_" })).toBeNull();
  });

  it("não usa preview_shareable_link — nem quando é o único campo disponível (AC2)", () => {
    // Este é o teste da tentação: o `fb.me` cobre 100% dos anúncios, é
    // exatamente o link que o chamado pediu, e está a um campo de distância.
    //
    // Mas ele redireciona para
    // `business.facebook.com/…?encrypted_experience_id=…` — carrega token e
    // exige sessão do Business Manager. Persistido no jsonb, viraria um link
    // com cara de válido que falha no clique de quem consome.
    //
    // Se alguém "resolver" a ausência trocando o resolver por ele, este teste
    // quebra e explica por quê.
    const soPreview = {
      preview_shareable_link: "https://fb.me/2l3ExIyic5jzLnj",
    } as Parameters<typeof resolveAdPermalinkUrl>[0];
    expect(resolveAdPermalinkUrl(soPreview)).toBeNull();
  });

  it("ignora link_url e object_story_spec — eles respondem outra pergunta", () => {
    // `linkUrl` é o DESTINO do clique (a LP). Confundir os dois apagaria a
    // distinção que é o ponto da story (AC4).
    expect(
      resolveAdPermalinkUrl({
        link_url: "https://lp.exemplo.com/destino",
        object_story_spec: { link_data: { link: "https://lp.exemplo.com/destino" } },
      }),
    ).toBeNull();
  });

  it("o carimbo de versão existe e começa em 1", () => {
    // Sem ele, `adPermalinkUrl: null` gravado por código que ainda não
    // perguntava pelo campo é indistinguível de "a Meta não tem post".
    expect(AD_PERMALINK_RESOLVER_VERSION).toBeGreaterThanOrEqual(1);
  });
});
