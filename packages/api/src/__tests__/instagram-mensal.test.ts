/**
 * A tabela mensal do orgânico.
 *
 * O que protege, em ordem de gravidade:
 *
 * 1. FOLLOWER = novos e NON_FOLLOWER = unfollows. Trocar os dois inverte o
 *    sinal do mês inteiro e ninguém nota olhando a tela. Conferido ao vivo em
 *    @odanilogato: a série diária de `follower_count` somou 3.109, igual ao
 *    `FOLLOWER`, enquanto `NON_FOLLOWER` deu 1.663.
 * 2. `reach` chega como série diária e precisa ser SOMADO — lê-lo como
 *    total_value daria zero e a tabela mostraria um mês sem alcance nenhum.
 * 3. Variação sem base de comparação é `null`, nunca um número.
 */

import { describe, expect, it } from "vitest";
import {
  comVariacao,
  janelasMensais,
  melhorPostDoMes,
  montarLinha,
  reconstruirSeguidores,
  tituloDoPost,
  type EntradaDeInsight,
  type PostDoMes,
} from "../services/instagram-mensal.js";

const insightsDe = (over: {
  novos?: number;
  unfollows?: number;
  alcanceDiario?: number[];
  /** Alcance único do período; sem ele, o fixture usa a soma dos dias. */
  alcanceUnico?: number;
  views?: number;
  interacoes?: number;
}): EntradaDeInsight[] => [
  {
    name: "follows_and_unfollows",
    total_value: {
      breakdowns: [
        {
          dimension_keys: ["follow_type"],
          results: [
            { dimension_values: ["FOLLOWER"], value: over.novos ?? 0 },
            { dimension_values: ["NON_FOLLOWER"], value: over.unfollows ?? 0 },
          ],
        },
      ],
    },
  },
  {
    name: "reach",
    values: (over.alcanceDiario ?? []).map((v, i) => ({ value: v, end_time: `2026-08-0${i + 1}` })),
  },
  { name: "views", total_value: { value: over.views ?? 0 } },
  // O alcance do mês é o valor ÚNICO da Meta, não a soma dos dias — somar
  // conta de novo quem apareceu em mais de um (1,59M contra 1,08M em agosto
  // de @odanilogato).
  {
    name: "reach_total",
    total_value: {
      value: over.alcanceUnico ?? (over.alcanceDiario ?? []).reduce((s: number, v: number) => s + v, 0),
    },
  },
  // Interações somam as partes: `total_interactions` devolve mais que a soma,
  // e o app do Instagram mostra a soma.
  { name: "likes", total_value: { value: over.interacoes ?? 0 } },
];

const post = (id: string, over: Partial<PostDoMes> = {}): PostDoMes => ({
  id,
  timestamp: "2026-08-10T12:00:00+0000",
  caption: `Legenda ${id}`,
  permalink: `https://instagram.com/p/${id}`,
  mediaType: "VIDEO",
  reach: 1000,
  likes: 10,
  comments: 0,
  saved: 0,
  shares: 0,
  ...over,
});

describe("montarLinha", () => {
  it("FOLLOWER são os NOVOS e NON_FOLLOWER são os UNFOLLOWS", () => {
    // Os números reais medidos em @odanilogato, 7 dias.
    const l = montarLinha("2026-09", insightsDe({ novos: 3109, unfollows: 1663 }), []);
    expect(l.novosSeguidores).toBe(3109);
    expect(l.unfollows).toBe(1663);
    expect(l.crescimento).toBe(1446);
  });

  it("crescimento negativo quando saíram mais do que entraram", () => {
    const l = montarLinha("2026-09", insightsDe({ novos: 500, unfollows: 900 }), []);
    expect(l.crescimento).toBe(-400);
  });

  it("SOMA a série diária de alcance — lê-la como total daria zero", () => {
    const l = montarLinha("2026-08", insightsDe({ alcanceDiario: [100, 250, 400] }), []);
    expect(l.alcance).toBe(750);
  });

  it("engajamento é sobre o alcance, em pontos percentuais", () => {
    const l = montarLinha("2026-08", insightsDe({ alcanceDiario: [1000], interacoes: 42 }), []);
    expect(l.engajamento).toBe(4.2);
  });

  it("sem alcance não inventa taxa", () => {
    expect(montarLinha("2026-08", insightsDe({ interacoes: 42 }), []).engajamento).toBeNull();
  });

  it("mês sem post não tem melhor post", () => {
    expect(montarLinha("2026-08", insightsDe({}), []).melhorPost).toBeNull();
  });

  // Medido em @fernandazapparoli, mar/25: 856 mil de alcance e views = 0.
  // A métrica não existia ainda; zero ali puxaria a variação para −100%.
  it("views zero com alcance é métrica que não existia — vira null", () => {
    const l = montarLinha("2025-03", insightsDe({ alcanceDiario: [856_000], views: 0 }), []);
    expect(l.views).toBeNull();
  });

  // Mesmo mês: curtidas = −2. Não há interação negativa.
  it("parte negativa não desconta interações reais", () => {
    const e = insightsDe({ alcanceDiario: [1000], interacoes: -2 });
    e.push({ name: "comments", total_value: { value: 30 } });
    expect(montarLinha("2025-03", e, []).interacoes).toBe(30);
  });

  it("sem nenhum insight o mês é 'sem dados', não um mês zerado", () => {
    expect(montarLinha("2026-01", [], []).semDados).toBe(true);
    expect(montarLinha("2026-01", insightsDe({}), []).semDados).toBe(false);
  });
});

describe("melhorPostDoMes", () => {
  it("é o de maior ENGAJAMENTO, não o de maior alcance", () => {
    const distribuido = post("a", { reach: 500_000, likes: 1000 }); // 0,2%
    const engajado = post("b", { reach: 10_000, likes: 900 }); // 9%
    expect(melhorPostDoMes([distribuido, engajado])?.id).toBe("b");
  });

  it("soma curtidas, comentários, salvamentos e compartilhamentos", () => {
    const p = post("a", { reach: 1000, likes: 10, comments: 5, saved: 3, shares: 2 });
    expect(melhorPostDoMes([p])?.interacoes).toBe(20);
  });

  it("sem alcance, decide pelas interações absolutas", () => {
    const fraco = post("a", { reach: 0, likes: 5 });
    const forte = post("b", { reach: 0, likes: 50 });
    expect(melhorPostDoMes([fraco, forte])?.id).toBe("b");
  });

  it("post COM alcance ganha de post sem — a taxa é a medida melhor", () => {
    const semAlcance = post("a", { reach: 0, likes: 9999 });
    const comAlcance = post("b", { reach: 100, likes: 1 });
    expect(melhorPostDoMes([semAlcance, comAlcance])?.id).toBe("b");
  });
});

describe("tituloDoPost", () => {
  it("usa a primeira linha da legenda", () => {
    expect(tituloDoPost("O gancho que funciona\n\n#marketing #copy")).toBe(
      "O gancho que funciona",
    );
  });

  it("pula linhas vazias no começo", () => {
    expect(tituloDoPost("\n\n  Depois de duas quebras")).toBe("Depois de duas quebras");
  });

  it("legenda vazia vira um rótulo, não uma string vazia", () => {
    expect(tituloDoPost(null)).toBe("Post sem legenda");
    expect(tituloDoPost("   ")).toBe("Post sem legenda");
  });
});

describe("reconstruirSeguidores", () => {
  it("anda de trás para frente a partir do total de hoje", () => {
    const linhas = [
      montarLinha("2026-06", insightsDe({ novos: 3200, unfollows: 0 }), []),
      montarLinha("2026-07", insightsDe({ novos: 4000, unfollows: 0 }), []),
      montarLinha("2026-08", insightsDe({ novos: 2000, unfollows: 0 }), []),
    ];
    const r = reconstruirSeguidores(linhas, 156_000);
    // 156.000 é o fim de agosto; julho é isso menos o crescimento de AGOSTO
    // (2.000), e junho menos o de julho (4.000). O crescimento do próprio
    // junho não entra: ele já estava dentro do total ao fim dele.
    expect(r.map((l) => l.seguidoresNoFim)).toEqual([150_000, 154_000, 156_000]);
  });

  it("conta o unfollow ao voltar no tempo", () => {
    const linhas = [montarLinha("2026-08", insightsDe({ novos: 1000, unfollows: 400 }), [])];
    // Cresceu 600 no mês, então começou com 100.000 - 600.
    expect(reconstruirSeguidores(linhas, 100_000)[0]!.seguidoresNoFim).toBe(100_000);
  });

  it("mês sem dado corta a reconstrução: dali para trás seria chute", () => {
    const linhas = [
      montarLinha("2026-06", insightsDe({ novos: 100 }), []),
      montarLinha("2026-07", [], []),
      montarLinha("2026-08", insightsDe({ novos: 2000 }), []),
    ];
    // O fim de julho é conhecido (156.000 − agosto); o de junho dependeria do
    // crescimento de julho, que ninguém sabe.
    expect(reconstruirSeguidores(linhas, 156_000).map((l) => l.seguidoresNoFim)).toEqual([
      null,
      154_000,
      156_000,
    ]);
  });

  it("não modifica as linhas recebidas", () => {
    const linhas = [montarLinha("2026-08", insightsDe({ novos: 10 }), [])];
    reconstruirSeguidores(linhas, 500);
    expect(linhas[0]!.seguidoresNoFim).toBeNull();
  });
});

describe("comVariacao", () => {
  const linha = (over: Parameters<typeof insightsDe>[0]) =>
    montarLinha("2026-08", insightsDe(over), []);

  it("o primeiro mês não tem com o que comparar", () => {
    expect(comVariacao([linha({ alcanceDiario: [100] })])[0]!.variacao.alcance).toBeNull();
  });

  it("calcula a variação percentual do mês anterior", () => {
    const r = comVariacao([linha({ alcanceDiario: [1000] }), linha({ alcanceDiario: [1180] })]);
    expect(r[1]!.variacao.alcance).toBe(18);
  });

  it("queda vem negativa", () => {
    const r = comVariacao([linha({ views: 1000 }), linha({ views: 800 })]);
    expect(r[1]!.variacao.views).toBe(-20);
  });

  it("engajamento varia em PONTOS, não em porcentagem da porcentagem", () => {
    const r = comVariacao([
      linha({ alcanceDiario: [1000], interacoes: 42 }), // 4,2%
      linha({ alcanceDiario: [1000], interacoes: 51 }), // 5,1%
    ]);
    // 0,9 ponto — e não "+21%", que se confundiria com a própria taxa.
    expect(r[1]!.variacao.engajamento).toBe(0.9);
  });

  it("vizinho sem dado não vira base de comparação", () => {
    const r = comVariacao([
      montarLinha("2026-07", [], []),
      linha({ alcanceDiario: [500] }),
    ]);
    expect(r[1]!.variacao.alcance).toBeNull();
  });

  it("views sem dado não tem variação", () => {
    const r = comVariacao([
      linha({ alcanceDiario: [500], views: 900 }),
      linha({ alcanceDiario: [500], views: 0 }),
    ]);
    expect(r[1]!.views).toBeNull();
    expect(r[1]!.variacao.views).toBeNull();
  });

  it("base zero não vira +100% — vira nada", () => {
    const r = comVariacao([linha({ alcanceDiario: [0] }), linha({ alcanceDiario: [500] })]);
    expect(r[1]!.variacao.alcance).toBeNull();
  });
});

describe("janelasMensais", () => {
  it("devolve do mais antigo ao mais recente, terminando no mês corrente", () => {
    const j = janelasMensais(3, new Date("2026-09-08T12:00:00Z"));
    expect(j.map((x) => x.mes)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("o fim é o primeiro instante do mês seguinte — `until` é exclusivo", () => {
    const j = janelasMensais(1, new Date("2026-02-15T00:00:00Z"));
    expect(j[0]!.inicio.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    // Fevereiro de 2026 tem 28 dias: um "dia 31" perderia o mês inteiro.
    expect(j[0]!.fim.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("atravessa a virada do ano", () => {
    const j = janelasMensais(3, new Date("2026-01-10T00:00:00Z"));
    expect(j.map((x) => x.mes)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});
