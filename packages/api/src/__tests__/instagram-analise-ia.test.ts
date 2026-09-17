import { describe, expect, it } from "vitest";
import {
  formatoDoPost,
  limparAnalise,
  montarDadosDaAnalise,
  type PostParaAnalise,
} from "../services/instagram-analise-ia.js";

const post = (x: Partial<PostParaAnalise>): PostParaAnalise => ({
  id: "p" + Math.random().toString(36).slice(2, 8),
  timestamp: "2026-09-10T12:00:00+0000",
  media_type: "VIDEO",
  media_product_type: "REELS",
  ...x,
});

const insights = (alcance: number, interacoes: number, views = 0) => [
  { name: "reach", values: [{ value: alcance / 2 }, { value: alcance / 2 }] },
  // Alcance único do período (o que a tela usa) e interações pela soma das
  // partes — as duas regras conferidas contra o app do Instagram.
  { name: "reach_total", total_value: { value: alcance } },
  { name: "likes", total_value: { value: interacoes } },
  { name: "views", total_value: { value: views } },
  {
    name: "reach_follow_type",
    total_value: {
      breakdowns: [
        {
          results: [
            { dimension_values: ["FOLLOWER"], value: 250 },
            { dimension_values: ["NON_FOLLOWER"], value: 750 },
          ],
        },
      ],
    },
  },
];

describe("montarDadosDaAnalise", () => {
  const a = post({ id: "a", reach: 10_000, views: 20_000, like_count: 800, shares: 150, saved: 50, skip_rate: 30, caption: "Pare de fazer isso\n#tag" });
  const b = post({ id: "b", reach: 2_000, views: 3_000, like_count: 40, shares: 5, saved: 5, skip_rate: 60 });
  const c = post({ id: "c", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", reach: 3_000, views: 4_000, like_count: 200, saved: 250, shares: 20, follows: 30 });

  const dados = montarDadosDaAnalise({
    posts: [a, b, c],
    atual: insights(1_000_000, 50_000, 2_000_000),
    anterior: insights(800_000, 50_000, 1_000_000),
    periodo: { de: "2026-08-16", ate: "2026-09-15" },
  });

  it("variação do perfil vem calculada", () => {
    expect(dados.perfil.alcance).toBe(1_000_000);
    expect(dados.variacao_vs_periodo_anterior_pct.alcance).toBe(25);
    expect(dados.variacao_vs_periodo_anterior_pct.views).toBe(100);
    // 5% → 6,25%: em pontos, não em %.
    expect(dados.variacao_vs_periodo_anterior_pct.engajamento_pp).toBeCloseTo(-1.3, 1);
    expect(dados.perfil.alcance_de_nao_seguidores_pct).toBe(75);
  });

  it("cada post vem com gancho, engajamento e comparação com a média", () => {
    const pa = dados.posts.find((p) => p.id === "a")!;
    expect(pa.gancho_3s_pct).toBe(70);
    expect(pa.engajamento_pct).toBe(10); // (800+150+50)/10.000
    expect(pa.vs_media_do_perfil.alcance_pct).toBe(100); // média 5.000
    expect(pa.legenda).toBe("Pare de fazer isso #tag");
  });

  it("conversão em seguidor só onde a Meta dá seguidores", () => {
    expect(dados.posts.find((p) => p.id === "c")!.conversao_view_em_seguidor_pct).toBe(0.75);
    expect(dados.posts.find((p) => p.id === "a")!.conversao_view_em_seguidor_pct).toBeNull();
  });

  it("formato e rankings", () => {
    expect(dados.por_formato.map((f) => f.formato)).toEqual(["reels", "carrossel"]);
    expect(dados.por_formato[0]!.seguidores_gerados).toBeNull();
    expect(dados.rankings.maior_engajamento[0]).toBe("c"); // 470/3.000 = 15,7%
    expect(dados.rankings.menor_engajamento[0]).toBe("b");
  });
});

describe("formatoDoPost", () => {
  it("igual ao dashboard", () => {
    expect(formatoDoPost({ media_type: "VIDEO" })).toBe("reels");
    expect(formatoDoPost({ media_type: "CAROUSEL_ALBUM" })).toBe("carrossel");
    expect(formatoDoPost({ media_type: "IMAGE" })).toBe("estatico");
  });
});

describe("limparAnalise", () => {
  it("descarta destaque de post que não existe e corta o excesso", () => {
    const r = limparAnalise(
      {
        insights: Array.from({ length: 7 }, (_, i) => ({ titulo: `i${i}`, explicacao: "" })),
        melhores: [
          { post_id: "a", por_que: "", fatores: [] },
          { post_id: "inventado", por_que: "", fatores: [] },
        ],
        piores: [],
        padroes: [],
      },
      new Set(["a"]),
    );
    expect(r.insights).toHaveLength(5);
    expect(r.melhores.map((m) => m.post_id)).toEqual(["a"]);
  });
});
