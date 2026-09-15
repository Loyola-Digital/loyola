import { describe, expect, it } from "vitest";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import {
  conclusoesDosFormatos,
  conversaoEmSeguidor,
  diasDePico,
  formatoDoPost,
  mediasDoPerfil,
  performancePorFormato,
  postsDoPico,
  variacao,
  vsMedia,
} from "../instagram-posts";

const post = (x: Partial<InstagramMedia>): InstagramMedia => ({
  id: Math.random().toString(36).slice(2),
  media_type: "IMAGE",
  timestamp: "2026-09-10T12:00:00+0000",
  ...x,
});

describe("formatoDoPost", () => {
  it("separa Reels, carrossel e estático", () => {
    expect(formatoDoPost({ media_type: "VIDEO", media_product_type: "REELS" })).toBe("reels");
    expect(formatoDoPost({ media_type: "VIDEO" })).toBe("reels");
    expect(formatoDoPost({ media_type: "CAROUSEL_ALBUM", media_product_type: "FEED" })).toBe("carrossel");
    expect(formatoDoPost({ media_type: "IMAGE", media_product_type: "FEED" })).toBe("estatico");
  });
});

describe("conversaoEmSeguidor", () => {
  it("100 mil views e 1.200 seguidores = 1,2%", () => {
    expect(conversaoEmSeguidor(post({ views: 100_000, follows: 1_200 }))).toBeCloseTo(1.2);
  });

  it("sem seguidores (Reels) ou sem views: null, não zero", () => {
    expect(conversaoEmSeguidor(post({ views: 1000, follows: null }))).toBeNull();
    expect(conversaoEmSeguidor(post({ views: 0, follows: 5 }))).toBeNull();
  });
});

describe("mediasDoPerfil", () => {
  it("post sem o dado não entra como zero na média", () => {
    // O Reels sem seguidores não pode puxar a média dos carrosséis para baixo.
    const m = mediasDoPerfil([
      post({ follows: 10, shares: 100 }),
      post({ follows: 30, shares: 300 }),
      post({ media_type: "VIDEO", follows: null, shares: 200 }),
    ]);
    expect(m.follows).toBe(20);
    expect(m.shares).toBe(200);
  });

  it("nenhum post com o dado: null", () => {
    expect(mediasDoPerfil([post({})]).follows).toBeNull();
  });
});

describe("vsMedia", () => {
  it("4.300 contra média 2.500 = +72%", () => {
    expect(vsMedia(4300, 2500)).toBeCloseTo(72);
  });

  it("taxa compara em pontos percentuais", () => {
    expect(vsMedia(5.1, 4.2, true)).toBeCloseTo(0.9);
  });

  it("média zero ou ausente não vira +100%", () => {
    expect(vsMedia(10, 0)).toBeNull();
    expect(vsMedia(10, null)).toBeNull();
    expect(vsMedia(null, 10)).toBeNull();
  });
});

describe("performancePorFormato", () => {
  const posts = [
    post({ media_type: "VIDEO", reach: 10_000, views: 20_000, like_count: 300, saved: 20, shares: 80 }),
    post({ media_type: "VIDEO", reach: 30_000, views: 50_000, like_count: 500, saved: 40, shares: 60 }),
    post({ media_type: "CAROUSEL_ALBUM", reach: 5_000, like_count: 300, saved: 150, shares: 50, follows: 40 }),
  ];

  it("engajamento é soma das interações ÷ soma do alcance", () => {
    const reels = performancePorFormato(posts).find((l) => l.formato === "reels")!;
    // (300+20+80 + 500+40+60) / 40.000
    expect(reels.engajamento).toBeCloseTo(2.5);
    expect(reels.alcanceMedio).toBe(20_000);
    expect(reels.posts).toBe(2);
  });

  it("formato sem post não aparece; Reels sem seguidores fica null", () => {
    const linhas = performancePorFormato(posts);
    expect(linhas.map((l) => l.formato)).toEqual(["reels", "carrossel"]);
    expect(linhas[0]!.seguidores).toBeNull();
    expect(linhas[1]!.seguidores).toBe(40);
  });

  it("as conclusões apontam o líder de cada coisa", () => {
    const frases = conclusoesDosFormatos(performancePorFormato(posts));
    expect(frases[0]).toBe("Carrossel teve o maior engajamento (10,0%).");
    expect(frases[1]).toBe("Reels teve o maior alcance médio (4,0x Carrossel).");
  });

  it("com um formato só, não há o que comparar", () => {
    expect(conclusoesDosFormatos(performancePorFormato([posts[0]!]))).toEqual([]);
  });
});

describe("postsDoPico", () => {
  const fim = "2026-09-11T07:00:00+0000";

  it("pega os posts das 72h que terminam no ponto, do maior alcance ao menor", () => {
    const a = post({ timestamp: "2026-09-10T20:00:00+0000", reach: 100 });
    const b = post({ timestamp: "2026-09-09T10:00:00+0000", reach: 900 });
    const velho = post({ timestamp: "2026-09-07T10:00:00+0000", reach: 5000 });
    const depois = post({ timestamp: "2026-09-11T08:00:00+0000", reach: 5000 });
    expect(postsDoPico([a, b, velho, depois], fim).map((p) => p.reach)).toEqual([900, 100]);
  });

  it("data inválida não quebra", () => {
    expect(postsDoPico([post({})], "")).toEqual([]);
  });
});

describe("diasDePico", () => {
  it("marca os 3 dias de maior alcance", () => {
    expect([...diasDePico([{ reach: 5 }, { reach: 50 }, { reach: 0 }, { reach: 30 }, { reach: 40 }])].sort()).toEqual([1, 3, 4]);
  });
});

describe("variacao", () => {
  it("1,63M contra 1,38M = +18%", () => {
    expect(variacao(1_630_000, 1_381_356)).toBeCloseTo(18, 0);
  });

  it("base zero ou ausente: null", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(10, undefined)).toBeNull();
  });
});
