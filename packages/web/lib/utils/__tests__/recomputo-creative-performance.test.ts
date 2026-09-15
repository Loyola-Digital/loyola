// Story 18.81 — AC3 (Atualizar recomputa) e AC4 (cache vencido visível).
import { describe, expect, it } from "vitest";
import {
  CHAVE_CREATIVE_PERFORMANCE,
  chaveDaQueryKey,
  chaveDeRecomputo,
  criarPedidosDeRecomputo,
  montarUrlCreativePerformance,
  textoDeCacheVencido,
} from "../recomputo-creative-performance";

describe("montarUrlCreativePerformance — a URL que vai ser enviada (AC3)", () => {
  it("sem pedido de recomputo: só days — o cache de 2h continua valendo", () => {
    expect(
      montarUrlCreativePerformance({ funnelId: "f1", stageId: "s1", days: 30, recomputar: false }),
    ).toBe("/api/funnels/f1/stages/s1/creative-performance?days=30");
  });

  it("com pedido de recomputo: &refresh=1 — é o que a rota lê para ignorar o cache", () => {
    expect(
      montarUrlCreativePerformance({ funnelId: "f1", stageId: "s1", days: 7, recomputar: true }),
    ).toBe("/api/funnels/f1/stages/s1/creative-performance?days=7&refresh=1");
  });
});

describe("pedidos de recomputo — consumido UMA vez (AC3)", () => {
  it("sem pedido, consumir devolve false — navegação normal não recomputa", () => {
    const p = criarPedidosDeRecomputo();
    expect(p.consumir(chaveDeRecomputo("s1", 30))).toBe(false);
  });

  it("depois do pedido, consumir devolve true uma vez e false na seguinte", () => {
    const p = criarPedidosDeRecomputo();
    const chave = chaveDeRecomputo("s1", 30);
    p.pedir(chave);
    expect(p.pendentes()).toEqual(["s1:30"]);
    expect(p.consumir(chave)).toBe(true);
    expect(p.consumir(chave)).toBe(false);
    expect(p.pendentes()).toEqual([]);
  });

  it("pedido de uma janela não vaza para outra — a chave do cache é stageId:days", () => {
    const p = criarPedidosDeRecomputo();
    p.pedir(chaveDeRecomputo("s1", 7));
    expect(p.consumir(chaveDeRecomputo("s1", 30))).toBe(false);
    expect(p.consumir(chaveDeRecomputo("s1", 7))).toBe(true);
  });
});

describe("chaveDaQueryKey — o botão só pede recomputo do que conhece", () => {
  it("lê a queryKey compartilhada [prefixo, funnelId, stageId, days]", () => {
    expect(chaveDaQueryKey([CHAVE_CREATIVE_PERFORMANCE, "f1", "s1", 30])).toBe("s1:30");
  });

  it("qualquer outra forma devolve null", () => {
    expect(chaveDaQueryKey(["outra-query", "f1", "s1", 30])).toBeNull();
    expect(chaveDaQueryKey([CHAVE_CREATIVE_PERFORMANCE, "f1", "s1"])).toBeNull();
    expect(chaveDaQueryKey([CHAVE_CREATIVE_PERFORMANCE, "f1", "", 30])).toBeNull();
    expect(chaveDaQueryKey([CHAVE_CREATIVE_PERFORMANCE, "f1", "s1", "30"])).toBeNull();
    expect(chaveDaQueryKey([CHAVE_CREATIVE_PERFORMANCE, "f1", "s1", NaN])).toBeNull();
  });
});

describe("textoDeCacheVencido — cache vencido nunca é silêncio (AC4)", () => {
  it("resposta fresca ou cache dentro do prazo: sem aviso", () => {
    expect(textoDeCacheVencido(undefined)).toBeNull();
    expect(textoDeCacheVencido({ hit: false, computedAt: "2026-09-15T13:00:00.000Z" })).toBeNull();
    expect(textoDeCacheVencido({ hit: true, computedAt: "2026-09-15T13:00:00.000Z" })).toBeNull();
    expect(textoDeCacheVencido({ hit: true, stale: false, computedAt: "2026-09-15T13:00:00.000Z" })).toBeNull();
  });

  it("stale: data/hora do computedAt em São Paulo (UTC-3), independente do fuso do runner", () => {
    expect(
      textoDeCacheVencido({ hit: true, stale: true, computedAt: "2026-09-14T21:32:00.000Z" }),
    ).toBe("Dados de 14/09 18:32 — a Meta não respondeu; clique em Atualizar");
  });

  it("stale na virada do dia em UTC ainda mostra o dia de São Paulo", () => {
    // 01:10Z do dia 15 = 22:10 do dia 14 em São Paulo.
    expect(
      textoDeCacheVencido({ hit: true, stale: true, computedAt: "2026-09-15T01:10:00.000Z" }),
    ).toBe("Dados de 14/09 22:10 — a Meta não respondeu; clique em Atualizar");
  });

  it("computedAt ilegível: avisa mesmo assim, sem carimbo", () => {
    expect(textoDeCacheVencido({ hit: true, stale: true, computedAt: "ontem" })).toBe(
      "Dados de cache vencido — a Meta não respondeu; clique em Atualizar",
    );
  });
});
