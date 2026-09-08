import { describe, expect, it } from "vitest";
import {
  aprenderVocabulario,
  camposDaSugestao,
  podeCatalogar,
} from "../services/swipe-catalogo.js";
import type {
  SugestaoDeSwipe,
  VocabularioDoAcervo,
} from "../services/swipe-analise.js";

const sugestao = (over: Partial<SugestaoDeSwipe> = {}): SugestaoDeSwipe => ({
  titulo: "peça",
  anotacoes: "",
  marca: null,
  nicho: null,
  plataforma: null,
  formato: null,
  tags: [],
  ...over,
});

describe("podeCatalogar", () => {
  it("aceita imagem, PDF, página e documento", () => {
    expect(podeCatalogar({ assetKind: "image", fileMime: "image/png" })).toBe(
      true,
    );
    expect(
      podeCatalogar({ assetKind: "pdf", fileMime: "application/pdf" }),
    ).toBe(true);
    expect(podeCatalogar({ assetKind: "html", fileMime: "text/html" })).toBe(
      true,
    );
    expect(podeCatalogar({ assetKind: "doc", fileMime: "text/plain" })).toBe(
      true,
    );
  });

  it("recusa vídeo, mesmo com mime que passaria", () => {
    // Ninguém assiste o vídeo — nem nós, nem o modelo. Tag inventada do nome do
    // arquivo some da busca certa e aparece na errada.
    expect(podeCatalogar({ assetKind: "video", fileMime: "video/mp4" })).toBe(
      false,
    );
  });

  it("recusa item sem mime", () => {
    expect(podeCatalogar({ assetKind: "image", fileMime: null })).toBe(false);
  });
});

describe("aprenderVocabulario", () => {
  it("põe o valor novo no começo, onde é mais provável se repetir", () => {
    const v: VocabularioDoAcervo = { marcas: ["Antigo"] };
    aprenderVocabulario(v, sugestao({ marca: "Navarro" }));
    expect(v.marcas).toEqual(["Navarro", "Antigo"]);
  });

  it("não duplica o que já está lá", () => {
    const v: VocabularioDoAcervo = { marcas: ["Navarro"] };
    aprenderVocabulario(v, sugestao({ marca: "Navarro" }));
    expect(v.marcas).toEqual(["Navarro"]);
  });

  it("ignora vazio e só-espaços", () => {
    // O modelo deixa o campo em branco quando não tem certeza — e é o certo.
    // Aprender "" encheria o prompt seguinte de lixo.
    const v: VocabularioDoAcervo = { marcas: ["Navarro"] };
    aprenderVocabulario(v, sugestao({ marca: "   " }));
    aprenderVocabulario(v, sugestao({ marca: null }));
    expect(v.marcas).toEqual(["Navarro"]);
  });

  it("parte do zero quando o acervo está vazio", () => {
    const v: VocabularioDoAcervo = {};
    aprenderVocabulario(
      v,
      sugestao({ marca: "Navarro", nicho: "finanças", tags: ["vsl"] }),
    );
    expect(v).toEqual({
      marcas: ["Navarro"],
      nichos: ["finanças"],
      tags: ["vsl"],
    });
  });

  it("acumula tags sem repetir", () => {
    const v: VocabularioDoAcervo = { tags: ["vsl"] };
    aprenderVocabulario(
      v,
      sugestao({ tags: ["vsl", "prova-social", "escassez"] }),
    );
    expect(v.tags).toEqual(["escassez", "prova-social", "vsl"]);
  });
});

describe("camposDaSugestao", () => {
  it("não devolve o título", () => {
    // O título é o nome do arquivo que a pessoa reconhece na grade. Trocá-lo em
    // massa faria ninguém achar o que acabou de subir.
    const campos = camposDaSugestao(sugestao({ titulo: "Outro nome" }));
    expect(campos).not.toHaveProperty("title");
    expect(campos).not.toHaveProperty("titulo");
  });

  it("vazio vira null, não string vazia", () => {
    const campos = camposDaSugestao(sugestao({ marca: "", nicho: null }));
    expect(campos.brand).toBeNull();
    expect(campos.niche).toBeNull();
  });

  it("corta em 20 tags", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => `t${i}`);
    expect(camposDaSugestao(sugestao({ tags: muitas })).tags).toHaveLength(20);
  });
});
