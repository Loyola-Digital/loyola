import { describe, expect, it } from "vitest";
import {
  montarDadosDoPost,
  type PostParaLeitura,
} from "../services/instagram-analise-de-post.js";

const post = (x: Partial<PostParaLeitura>): PostParaLeitura => ({
  id: "p" + Math.random().toString(36).slice(2, 7),
  postedAt: new Date("2026-09-10T12:00:00Z"),
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  ...x,
});

const reels = (reach: number, shares: number, skip: number) =>
  post({ reach, shares, skipRate: skip, likeCount: reach / 10, saved: reach / 50 });

describe("montarDadosDoPost", () => {
  const alvo = post({
    reach: 100_000,
    views: 200_000,
    likeCount: 8_000,
    commentsCount: 400,
    shares: 5_000,
    saved: 1_000,
    skipRate: 30,
    avgWatchTimeMs: 39_940,
    caption: "Pare de fazer isso com seu filho\n#dica",
  });
  const referencia = [
    reels(50_000, 1_000, 50),
    reels(30_000, 500, 60),
    post({ mediaType: "CAROUSEL_ALBUM", mediaProductType: "FEED", reach: 10_000, shares: 100, saved: 800, likeCount: 500, follows: 40 }),
  ];
  const d = montarDadosDoPost(alvo, referencia);

  it("o post vai com as contas prontas", () => {
    expect(d.post.engajamento_pct).toBe(14.4); // (8.000+400+5.000+1.000)/100.000
    expect(d.post.gancho_3s_pct).toBe(70);
    expect(d.post.tempo_medio_assistido_s).toBe(39.9);
    expect(d.post.legenda).toBe("Pare de fazer isso com seu filho #dica");
  });

  it("compara com a média do perfil, em % e em pontos", () => {
    // Média de alcance do perfil: (50.000 + 30.000 + 10.000) / 3 = 30.000.
    expect(d.media_do_perfil.alcance).toBe(30_000);
    expect(d.vs_media_do_perfil_pct.alcance).toBe(233);
    expect(d.vs_media_do_perfil_pct.gancho_pp).toBe(25); // 70 contra média 45
  });

  it("tem uma régua só do mesmo formato", () => {
    // Comparar um Reels com a média que inclui carrossel fala do formato, não
    // do post.
    expect(d.media_do_mesmo_formato.posts).toBe(2);
    expect(d.media_do_mesmo_formato.alcance).toBe(40_000);
  });

  it("seguidores em Reels ficam null, e null não vira zero na média", () => {
    expect(d.post.seguidores_gerados).toBeNull();
    // Só o carrossel tem o dado: a média é dele, não dividida por três.
    expect(d.media_do_perfil.seguidores).toBe(40);
  });

  it("seguidores digitados à mão entram como seguidores", () => {
    const comManual = montarDadosDoPost(post({ followsManual: 1_200, views: 100_000 }), referencia);
    expect(comManual.post.seguidores_gerados).toBe(1_200);
  });

  it("post sem alcance não inventa engajamento", () => {
    expect(montarDadosDoPost(post({ reach: null }), referencia).post.engajamento_pct).toBeNull();
  });
});
