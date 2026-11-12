import { describe, expect, it } from "vitest";
import {
  agruparPorChamada,
  chamadaDaLegenda,
  comentariosPorMil,
  leituraDasChamadas,
} from "../instagram-chamadas";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";

const post = (over: Partial<InstagramMedia> = {}): InstagramMedia =>
  ({
    id: "p1",
    media_type: "IMAGE",
    timestamp: "2026-11-01T12:00:00+0000",
    caption: null,
    reach: 10_000,
    comments_count: 0,
    ...over,
  }) as InstagramMedia;

describe("chamadaDaLegenda", () => {
  it("pega a palavra pedida no comentário", () => {
    const c = chamadaDaLegenda("Quer o material? Comente GUIA que eu te mando.");
    expect(c).toEqual({ tipo: "comentario", palavra: "GUIA", rotulo: "Comente GUIA" });
  });

  it("aceita as formas do verbo e o 'a palavra'", () => {
    for (const texto of [
      "comenta GUIA",
      "COMENTE GUIA",
      "Comentem GUIA aqui",
      "comente a palavra GUIA",
    ]) {
      expect(chamadaDaLegenda(texto).palavra).toBe("GUIA");
    }
  });

  // A caixa alta é o que distingue a palavra-chave do resto da frase. Um /i no
  // regex inteiro faria "comente que eu te mando" virar chamada "que".
  it("palavra em minúscula não é chamada", () => {
    expect(chamadaDaLegenda("comente que eu te mando o link").tipo).toBe("nenhuma");
  });

  it("duas letras é interjeição, não palavra-chave", () => {
    expect(chamadaDaLegenda("comente AI se você também sente isso").tipo).toBe("nenhuma");
  });

  it("reconhece o link na bio em várias redações", () => {
    for (const texto of [
      "O link está na bio!",
      "link da bio",
      "link in bio",
      "clique no LINK NA BIO",
    ]) {
      expect(chamadaDaLegenda(texto).tipo).toBe("bio");
    }
  });

  // O link na bio está em quase toda legenda e não distingue um post do outro.
  it("quando a legenda pede os dois, vale o comentário", () => {
    const c = chamadaDaLegenda("Comente BLACK para receber. O link também está na bio.");
    expect(c.tipo).toBe("comentario");
    expect(c.palavra).toBe("BLACK");
  });

  it("legenda sem chamada, e legenda vazia, não viram palpite", () => {
    expect(chamadaDaLegenda("Bom dia, time!").tipo).toBe("nenhuma");
    expect(chamadaDaLegenda(null).rotulo).toBe("Sem chamada");
    expect(chamadaDaLegenda(undefined).rotulo).toBe("Sem chamada");
  });
});

describe("comentariosPorMil", () => {
  it("são comentários por mil alcançados", () => {
    expect(comentariosPorMil(post({ reach: 10_000, comments_count: 240 }))).toBe(24);
  });

  it("sem alcance não há taxa — nem zero", () => {
    expect(comentariosPorMil(post({ reach: null, comments_count: 10 }))).toBeNull();
    expect(comentariosPorMil(post({ reach: 0, comments_count: 10 }))).toBeNull();
  });
});

describe("agruparPorChamada", () => {
  it("agrupa pela palavra e ordena pela taxa", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 240 }),
      post({ id: "b", caption: "Comente GUIA", reach: 10_000, comments_count: 380 }),
      post({ id: "c", caption: "Comente BLACK", reach: 10_000, comments_count: 80 }),
      post({ id: "d", caption: "Link na bio", reach: 10_000, comments_count: 10 }),
    ]);
    expect(linhas.map((l) => l.chamada)).toEqual([
      "Comente GUIA",
      "Comente BLACK",
      "Link na bio",
    ]);
    // Mediana de 24 e 38.
    expect(linhas[0]!.comentariosPorMil).toBe(31);
    expect(linhas[0]!.posts).toBe(2);
  });

  // Um post viral puxaria a palavra inteira e faria parecer que a chamada
  // rende quando rendeu o post.
  it("usa mediana, não média", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 10 }),
      post({ id: "b", caption: "Comente GUIA", reach: 10_000, comments_count: 20 }),
      post({ id: "c", caption: "Comente GUIA", reach: 10_000, comments_count: 3_000 }),
    ]);
    expect(linhas[0]!.comentariosPorMil).toBe(2);
  });

  it("grupo sem alcance fica no fim, com traço em vez de zero", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 100 }),
      post({ id: "b", caption: "Comente MFB", reach: null, comments_count: 100 }),
    ]);
    expect(linhas[1]!.chamada).toBe("Comente MFB");
    expect(linhas[1]!.comentariosPorMil).toBeNull();
  });

  it("sem posts, sem linhas", () => {
    expect(agruparPorChamada([])).toEqual([]);
  });
});

describe("leituraDasChamadas", () => {
  it("compara a melhor com a pior quando há base", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 240 }),
      post({ id: "b", caption: "Comente GUIA", reach: 10_000, comments_count: 380 }),
      post({ id: "c", caption: "Comente BLACK", reach: 10_000, comments_count: 8 }),
    ]);
    const frase = leituraDasChamadas(linhas)!;
    expect(frase).toContain('"Comente GUIA" rende 31 comentários por mil');
    expect(frase).toContain('"Comente BLACK", 0,8');
  });

  // "A chamada X rende 30× mais" a partir de um post só é ruído com cara de
  // conclusão.
  it("um post na melhor chamada não vira conclusão", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 240 }),
      post({ id: "c", caption: "Comente BLACK", reach: 10_000, comments_count: 8 }),
    ]);
    expect(leituraDasChamadas(linhas)).toBeNull();
  });

  it("uma chamada só não se compara com nada", () => {
    const linhas = agruparPorChamada([
      post({ id: "a", caption: "Comente GUIA", reach: 10_000, comments_count: 240 }),
      post({ id: "b", caption: "Comente GUIA", reach: 10_000, comments_count: 380 }),
    ]);
    expect(leituraDasChamadas(linhas)).toBeNull();
  });
});
