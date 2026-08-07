import { describe, it, expect } from "vitest";
import { buildMeasuredRates, deltaEmPontosPercentuais } from "../mvp-chain-rates";
import type { TaxaMedida } from "@/lib/hooks/use-vturb";

const medida = (valor: number | null, n = 0, d = 0, motivo?: string): TaxaMedida => ({
  valor,
  numerador: n,
  denominador: d,
  ...(motivo ? { motivo } : {}),
});

const vturbBase = {
  playerName: "NETÃO VSL V2.mp4",
  playerId: "6a5d2cf1926e614c3a7b20ee",
  viewedUniq: 4316,
  startedUniq: 2211,
  overPitch: 191,
  playRate: medida(0.51228, 2211, 4316),
  pitchRate: medida(0.08639, 191, 2211),
};

const overviewBase = {
  totalLinkClicks: 8000,
  totalCheckouts: 120,
  totalSales: 30,
};

describe("buildMeasuredRates — as taxas que o sistema mede", () => {
  it("deriva connect_rate dos brutos: pageviews do VTurb ÷ cliques da Meta", () => {
    const r = buildMeasuredRates({ overview: overviewBase, vturb: vturbBase });
    expect(r.connect_rate.value).toBeCloseTo(4316 / 8000, 10);
    expect(r.connect_rate.numerador).toBe(4316);
    expect(r.connect_rate.denominador).toBe(8000);
    // AC2: a proveniencia nomeia sistema, endpoint e campo — "VTurb" sozinho nao serve.
    expect(r.connect_rate.source).toContain("total_viewed_device_uniq");
    expect(r.connect_rate.source).toContain("6a5d2cf1926e614c3a7b20ee");
  });

  it("herda play_rate e pitch_rate do backend em vez de recalcular", () => {
    const r = buildMeasuredRates({ overview: overviewBase, vturb: vturbBase });
    expect(r.play_rate.value).toBe(0.51228);
    expect(r.pitch_rate.value).toBe(0.08639);
  });

  it("deriva conv_post_pitch e conv_checkout", () => {
    const r = buildMeasuredRates({ overview: overviewBase, vturb: vturbBase });
    expect(r.conv_post_pitch.value).toBeCloseTo(120 / 191, 10);
    expect(r.conv_checkout.value).toBeCloseTo(30 / 120, 10);
  });

  it("CHAIN-01: o numerador de um elo e o denominador do seguinte", () => {
    const r = buildMeasuredRates({ overview: overviewBase, vturb: vturbBase });
    // connect_rate.num (pageviews) === play_rate.den
    expect(r.connect_rate.numerador).toBe(r.play_rate.denominador);
    // play_rate.num (plays unicos) === pitch_rate.den
    expect(r.play_rate.numerador).toBe(r.pitch_rate.denominador);
    // pitch_rate.num (unicos no pitch) === conv_post_pitch.den
    expect(r.pitch_rate.numerador).toBe(r.conv_post_pitch.denominador);
    // conv_post_pitch.num (checkouts) === conv_checkout.den
    expect(r.conv_post_pitch.numerador).toBe(r.conv_checkout.denominador);
  });
});

describe("buildMeasuredRates — guardas", () => {
  it("taxa acima de 100% vira AUSENTE, NUNCA truncada em 100%", () => {
    // Pagina com trafego organico: mais pageviews que cliques no anuncio.
    const r = buildMeasuredRates({
      overview: { ...overviewBase, totalLinkClicks: 1000 },
      vturb: vturbBase,
    });
    expect(r.connect_rate.value).toBeNull();
    expect(r.connect_rate.value).not.toBe(1);
    expect(r.connect_rate.motivo).toMatch(/acima de 100%/);
    // Os brutos ficam visiveis para o gestor conferir de onde veio.
    expect(r.connect_rate.numerador).toBe(4316);
    expect(r.connect_rate.denominador).toBe(1000);
  });

  it("checkout acima do pitch vira AUSENTE com o motivo das populacoes distintas", () => {
    const r = buildMeasuredRates({
      overview: { ...overviewBase, totalCheckouts: 500 },
      vturb: vturbBase,
    });
    expect(r.conv_post_pitch.value).toBeNull();
    expect(r.conv_post_pitch.motivo).toMatch(/janela de conversão do pixel/);
  });

  it("denominador zero nao vira Infinity", () => {
    const r = buildMeasuredRates({
      overview: { ...overviewBase, totalLinkClicks: 0 },
      vturb: vturbBase,
    });
    expect(r.connect_rate.value).toBeNull();
    expect(Number.isFinite(r.connect_rate.value as number)).toBe(false);
    expect(r.connect_rate.motivo).toMatch(/denominador zero/);
  });

  it("numerador zero vira AUSENTE, nao 0 — U-01 aborta com zero", () => {
    const r = buildMeasuredRates({
      overview: { ...overviewBase, totalSales: 0 },
      vturb: vturbBase,
    });
    expect(r.conv_checkout.value).toBeNull();
    expect(r.conv_checkout.motivo).toMatch(/numerador zero/);
  });

  it("pitch_time nao configurado: herda a ausencia do backend, nao inventa", () => {
    const r = buildMeasuredRates({
      overview: overviewBase,
      vturb: { ...vturbBase, pitchRate: medida(null, 0, 2211, "pitch_time não configurado") },
    });
    expect(r.pitch_rate.value).toBeNull();
    expect(r.pitch_rate.motivo).toBe("pitch_time não configurado");
  });

  it("sem VSL vinculada: etapas de video ausentes, connect_rate com motivo", () => {
    const r = buildMeasuredRates({ overview: overviewBase, vturb: null });
    expect(r.connect_rate.value).toBeNull();
    expect(r.connect_rate.motivo).toMatch(/VSL não vinculada/);
    expect(r.play_rate).toBeUndefined();
    expect(r.pitch_rate).toBeUndefined();
    // conv_checkout so depende da Meta — segue medido.
    expect(r.conv_checkout.value).toBeCloseTo(0.25, 10);
  });

  it("sem overview: nao produz taxa que dependa da Meta", () => {
    const r = buildMeasuredRates({ overview: null, vturb: vturbBase });
    expect(r.conv_checkout).toBeUndefined();
    expect(r.conv_post_pitch.value).toBeNull();
    expect(r.play_rate.value).toBe(0.51228);
  });
});

describe("deltaEmPontosPercentuais", () => {
  it("51% -> 58% e +7,0 pp, nao +13,7%", () => {
    expect(deltaEmPontosPercentuais(0.58, 0.51)).toBeCloseTo(7, 10);
  });

  it("queda devolve negativo", () => {
    expect(deltaEmPontosPercentuais(0.51, 0.58)).toBeCloseTo(-7, 10);
  });

  it("ponta ausente devolve null — nunca -51 pp de uma medicao que nao existe", () => {
    expect(deltaEmPontosPercentuais(null, 0.51)).toBeNull();
    expect(deltaEmPontosPercentuais(0.51, null)).toBeNull();
    expect(deltaEmPontosPercentuais(null, null)).toBeNull();
  });
});
