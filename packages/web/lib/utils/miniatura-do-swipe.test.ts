/**
 * O que protege: vídeo e PDF nunca saem como "imagem".
 *
 * É o bug que já aconteceu na galeria — `<img src="...mp4">` em todo card de
 * vídeo — e que voltaria em silêncio ao reescrever a regra no mapa de funil.
 */

import { describe, expect, it } from "vitest";
import { miniaturaDoSwipe } from "./miniatura-do-swipe";

describe("miniaturaDoSwipe", () => {
  it("vídeo é vídeo, nunca imagem", () => {
    expect(miniaturaDoSwipe({ assetKind: "video", fileUrl: "a.mp4" })).toEqual({
      forma: "video",
      url: "a.mp4",
    });
  });

  it("pdf é pdf, nunca imagem", () => {
    expect(miniaturaDoSwipe({ assetKind: "pdf", fileUrl: "a.pdf" }).forma).toBe("pdf");
  });

  it("link usa a capa publicada pelo site", () => {
    expect(miniaturaDoSwipe({ assetKind: "link", ogImage: "capa.jpg", fileUrl: null })).toEqual({
      forma: "imagem",
      url: "capa.jpg",
    });
  });

  it("link sem capa não desenha nada — inventar um print é outra feature", () => {
    expect(miniaturaDoSwipe({ assetKind: "link", ogImage: null }).forma).toBe("nenhuma");
  });

  it("arquivo sem URL não vira miniatura quebrada", () => {
    for (const k of ["image", "video", "pdf"] as const) {
      expect(miniaturaDoSwipe({ assetKind: k, fileUrl: null }).forma).toBe("nenhuma");
    }
  });
});
