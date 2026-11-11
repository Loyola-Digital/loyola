import { describe, expect, it } from "vitest";
import { normalizarSugestoes, type PostParaEtiquetar } from "../services/instagram-temas.js";

const post = (id: string): PostParaEtiquetar => ({ id, caption: "...", postedAt: new Date("2026-10-01") });

const entrada = (ids: string[], existentes: string[] = []) => ({
  posts: ids.map(post),
  temasQueJaExistem: existentes,
});

describe("normalizarSugestoes", () => {
  it("devolve o tema de cada post pedido", () => {
    const r = normalizarSugestoes(
      [
        { id: "1", tema: "Rotina da família" },
        { id: "2", tema: "Inglês em casa" },
      ],
      entrada(["1", "2"]),
    );
    expect(r).toEqual([
      { id: "1", tema: "Rotina da família" },
      { id: "2", tema: "Inglês em casa" },
    ]);
  });

  it("um tema que já existe é reusado com a grafia do banco, não a do modelo", () => {
    // Senão a tabela de temas vira "Fé e família" e "fe e familia", com metade
    // dos posts em cada linha.
    const r = normalizarSugestoes([{ id: "1", tema: "fe e familia" }], entrada(["1"], ["Fé e família"]));
    expect(r[0].tema).toBe("Fé e família");
  });

  it("dois posts com a mesma grafia nova ficam com o mesmo tema", () => {
    const r = normalizarSugestoes(
      [
        { id: "1", tema: "Black MFB" },
        { id: "2", tema: "black mfb" },
      ],
      entrada(["1", "2"]),
    );
    expect(r[1].tema).toBe("Black MFB");
  });

  it("limpa hashtag, arroba, pontuação final e espaço repetido", () => {
    const r = normalizarSugestoes(
      [{ id: "1", tema: "  Promoção  de   Black #blackfriday @loja. " }],
      entrada(["1"]),
    );
    expect(r[0].tema).toBe("Promoção de Black");
  });

  it("tema vazio vira null — melhor sem etiqueta que com etiqueta errada", () => {
    const r = normalizarSugestoes(
      [
        { id: "1", tema: "   " },
        { id: "2", tema: null },
        { id: "3", tema: "#reels" },
      ],
      entrada(["1", "2", "3"]),
    );
    expect(r.map((x) => x.tema)).toEqual([null, null, null]);
  });

  it("id que ninguém pediu é descartado, e id repetido só vale uma vez", () => {
    const r = normalizarSugestoes(
      [
        { id: "999", tema: "Inventado" },
        { id: "1", tema: "Primeiro" },
        { id: "1", tema: "Segundo" },
      ],
      entrada(["1"]),
    );
    expect(r).toEqual([{ id: "1", tema: "Primeiro" }]);
  });

  it("tema quilométrico é cortado em 60 caracteres (o tamanho da coluna)", () => {
    const r = normalizarSugestoes([{ id: "1", tema: "a".repeat(200) }], entrada(["1"]));
    expect(r[0].tema).toHaveLength(60);
  });
});
