import { describe, it, expect } from "vitest";
import { parseActionCount } from "../utils/meta-metrics.js";
import { extractVideoMetrics, type RawAdInsight } from "../services/meta-ads.js";

/**
 * Story 43.3 — o 3s do payload de vídeo.
 *
 * Duas frentes: a leitura do `video_view` a partir de `actions[]` — com o MESMO
 * leitor que `traffic-analytics.ts:255` já usava — e `extractVideoMetrics`
 * inteira, que passou a ser exportada para que o caminho de AUSÊNCIA de campo
 * ficasse testável (foi por ele que o QA-26 passou).
 *
 * O ponto sob teste não é o parser genérico — é a decisão de ONDE o 3s mora.
 * `video_3_sec_watched_actions` NÃO existe na API da Meta (verificado no
 * catálogo de campos em 2026-08-14); o 3s é o `video_view` do Gerenciador.
 */

const acoes = (...pares: [string, string][]) =>
  pares.map(([action_type, value]) => ({ action_type, value }));

describe("3s de vídeo — leitura via actions[].video_view", () => {
  it("lê o video_view como reproduções de 3 segundos", () => {
    const actions = acoes(["link_click", "50"], ["video_view", "1234"], ["landing_page_view", "40"]);
    expect(parseActionCount(actions, "video_view")).toBe(1234);
  });

  it("devolve 0 quando o anúncio não é vídeo", () => {
    expect(parseActionCount(acoes(["link_click", "50"]), "video_view")).toBe(0);
  });

  it("tolera actions ausente", () => {
    expect(parseActionCount(undefined, "video_view")).toBe(0);
    expect(parseActionCount(null, "video_view")).toBe(0);
  });

  it("não confunde video_view com os quartis", () => {
    // Os quartis vêm em campos próprios (video_p25_watched_actions etc), não
    // dentro de `actions`. Se um dia aparecerem aqui, não devem virar o 3s.
    const actions = acoes(["video_p25_watched_actions", "999"], ["video_view", "100"]);
    expect(parseActionCount(actions, "video_view")).toBe(100);
  });

  it("valor não numérico vira 0, não NaN", () => {
    expect(parseActionCount(acoes(["video_view", "abc"]), "video_view")).toBe(0);
  });
});

describe("contrato dos campos de vídeo (AC4)", () => {
  /**
   * Estes testes documentam as definições oficiais em código executável. Não
   * exercitam lógica nova — travam o entendimento, para que a próxima pessoa
   * não derive uma taxa dividindo campos incompatíveis.
   */

  it("as fórmulas do Slide 22 usam views3s, não p25", () => {
    const m = { views3s: 1000, thruplay: 250, p75: 400, p25: 1800 };
    const impressions = 20000;

    const playDoHook = m.views3s / impressions;      // 5%
    const convDoHook = m.thruplay / m.views3s;       // 25% — thruplay É o 15s
    const retencaoBody = m.p75 / m.views3s;          // 40%

    expect(playDoHook).toBeCloseTo(0.05);
    expect(convDoHook).toBeCloseTo(0.25);
    expect(retencaoBody).toBeCloseTo(0.4);

    // p25 (1800) é MAIOR que views3s (1000) porque inclui quem PULOU até os
    // 25%. Usá-lo como gancho daria 9% em vez de 5% — quase o dobro.
    expect(m.p25 / impressions).toBeGreaterThan(playDoHook);
  });

  it("todos os campos são contagens do período, não taxas", () => {
    // Um valor de retenção nunca é fração entre 0 e 1 no payload: é contagem.
    const dia1 = { p25: 10, views3s: 40 };
    const dia2 = { p25: 15, views3s: 55 };
    const periodo = { p25: dia1.p25 + dia2.p25, views3s: dia1.views3s + dia2.views3s };
    expect(periodo).toEqual({ p25: 25, views3s: 95 });
  });
});

/**
 * QA-26 / QA-28 — ausência de campo NÃO pode virar zero.
 *
 * Este objeto é persistido em `meta_ad_insights_daily.video_metrics`. Com
 * `undefined`, `JSON.stringify` remove a chave e o jsonb sai sem ela — é assim
 * que o consumidor sabe que o dado não existe. Com `0`, grava um número
 * indistinguível de zero real, e isso não se recupera depois.
 *
 * Foi por este caminho que o defeito passou na primeira iteração: não havia
 * teste de ausência.
 */
describe("ausência de campo vs zero legítimo (QA-26)", () => {
  const base = {
    video_p25_watched_actions: [{ action_type: "video_view", value: "100" }],
  } as unknown as RawAdInsight;

  it("campo ausente NÃO vira zero — a chave some do objeto serializado", () => {
    const r = extractVideoMetrics(base);
    expect(r).not.toBeNull();
    expect(r!.plays).toBeUndefined();
    expect(r!.views3s).toBeUndefined();
    // O que de fato vai para o jsonb:
    expect(JSON.parse(JSON.stringify(r))).not.toHaveProperty("plays");
    expect(JSON.parse(JSON.stringify(r))).not.toHaveProperty("views3s");
  });

  it("zero legítimo é preservado — o campo veio, valendo zero", () => {
    const raw = {
      ...base,
      actions: [{ action_type: "link_click", value: "10" }],
      video_play_actions: [{ action_type: "video_view", value: "0" }],
    } as unknown as RawAdInsight;
    const r = extractVideoMetrics(raw);
    expect(r!.views3s).toBe(0);
    expect(r!.plays).toBe(0);
    // Aqui as chaves EXISTEM no jsonb, com zero — que é a informação correta.
    expect(JSON.parse(JSON.stringify(r))).toHaveProperty("views3s", 0);
    expect(JSON.parse(JSON.stringify(r))).toHaveProperty("plays", 0);
  });

  it("valores presentes são extraídos", () => {
    const raw = {
      ...base,
      actions: [{ action_type: "video_view", value: "1234" }],
      video_play_actions: [{ action_type: "video_view", value: "1500" }],
    } as unknown as RawAdInsight;
    const r = extractVideoMetrics(raw);
    expect(r!.views3s).toBe(1234);
    expect(r!.plays).toBe(1500);
  });

  it("anúncio sem NENHUM sinal de vídeo continua devolvendo null", () => {
    // A guarda usa `?? 0`: para decidir "isto é vídeo?", ausência e zero valem
    // o mesmo. A distinção entre os dois importa no valor exposto, não aqui.
    const semVideo = { actions: [{ action_type: "link_click", value: "10" }] } as unknown as RawAdInsight;
    expect(extractVideoMetrics(semVideo)).toBeNull();
    expect(extractVideoMetrics({} as RawAdInsight)).toBeNull();
  });

  it("vídeo com só o 3s (quartis zerados) É vídeo — QA-27", () => {
    // Mudança de comportamento consciente: antes a guarda olhava só os
    // quartis, então este caso voltava null e o 3s se perdia.
    const soTres = { actions: [{ action_type: "video_view", value: "80" }] } as unknown as RawAdInsight;
    const r = extractVideoMetrics(soTres);
    expect(r).not.toBeNull();
    expect(r!.views3s).toBe(80);
  });
});
