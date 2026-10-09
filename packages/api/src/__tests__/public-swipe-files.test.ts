/**
 * O acervo do Swipe Files na API pública.
 *
 * ## O que estes testes protegem
 *
 * O acervo é cheio de buraco, e isso é normal: medido em 09/10/2026, das 161
 * referências com link **129 não têm `og:image`**, e das 305 com arquivo
 * **303 estão sem `width`/`height`. Um `null` sozinho não diz a quem consome
 * se o dado não existe ou se a leitura falhou — então a resposta afirma
 * `semCapa` e `semDimensoes` de frente.
 *
 * E não sai quem subiu a peça: `createdBy` é dado de pessoa, não ajuda quem
 * consome a referência, e uma API pública que entrega nome de funcionário
 * junto de cada item entrega o que ninguém pediu.
 */

import { describe, expect, it } from "vitest";
import { paraApi } from "../routes/public-swipe-files.js";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Anúncio de escassez",
  notes: null,
  assetKind: "link",
  isFavorite: false,
  fileUrl: null,
  fileKey: null,
  fileMime: null,
  fileSizeBytes: null,
  width: null,
  height: null,
  sourceUrl: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  ogFetchedAt: null,
  brand: "Netão",
  niche: "food service",
  platform: "meta",
  format: "video",
  tags: ["escassez", "prova-social"],
  importKey: null,
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-02T10:00:00Z"),
} as unknown as Parameters<typeof paraApi>[0];

describe("o que a API pública entrega", () => {
  it("não entrega quem subiu a peça", () => {
    const r = paraApi(base);
    expect(JSON.stringify(r)).not.toContain("22222222");
    expect(r).not.toHaveProperty("criadoPor");
  });

  it("as etiquetas do acervo saem como o time as escreve", () => {
    const r = paraApi(base);
    expect(r).toMatchObject({
      marca: "Netão",
      nicho: "food service",
      plataforma: "meta",
      formato: "video",
      tags: ["escassez", "prova-social"],
    });
  });

  it("link sem og:image diz `semCapa` — é o caso de 129 dos 161 links", () => {
    const r = paraApi({ ...base, sourceUrl: "https://exemplo.com/lp" });
    expect(r.origem).toMatchObject({ url: "https://exemplo.com/lp", imagem: null, semCapa: true });
  });

  it("link COM capa não levanta a bandeira", () => {
    const r = paraApi({ ...base, sourceUrl: "https://x.com", ogImage: "https://x.com/capa.jpg" });
    expect(r.origem?.semCapa).toBe(false);
  });

  it("arquivo sem largura/altura diz `semDimensoes` — 303 dos 305", () => {
    const r = paraApi({ ...base, fileUrl: "https://cdn/x.mp4", assetKind: "video" });
    expect(r.arquivo).toMatchObject({ url: "https://cdn/x.mp4", semDimensoes: true });
  });

  it("arquivo com as duas medidas não levanta a bandeira", () => {
    const r = paraApi({ ...base, fileUrl: "https://cdn/x.jpg", width: 1080, height: 1350 });
    expect(r.arquivo).toMatchObject({ largura: 1080, altura: 1350, semDimensoes: false });
  });

  it("só uma das medidas ainda é sem dimensão — meia medida não dimensiona nada", () => {
    const r = paraApi({ ...base, fileUrl: "https://cdn/x.jpg", width: 1080, height: null });
    expect(r.arquivo?.semDimensoes).toBe(true);
  });

  it("peça sem arquivo e sem origem devolve null nos dois, não objeto vazio", () => {
    const r = paraApi(base);
    expect(r.arquivo).toBeNull();
    expect(r.origem).toBeNull();
  });

  it("as datas saem em ISO, não como objeto Date", () => {
    const r = paraApi(base);
    expect(r.criadoEm).toBe("2026-09-01T10:00:00.000Z");
    expect(r.atualizadoEm).toBe("2026-09-02T10:00:00.000Z");
  });

  it("sem tags, devolve lista vazia — nunca null", () => {
    const r = paraApi({ ...base, tags: null } as unknown as Parameters<typeof paraApi>[0]);
    expect(r.tags).toEqual([]);
  });
});
