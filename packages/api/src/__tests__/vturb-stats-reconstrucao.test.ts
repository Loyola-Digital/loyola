/**
 * A API do VTurb às vezes devolve o agregado zerado e o diário cheio, para o
 * mesmo período — visto em produção com 30 dias. Estes testes fixam a regra de
 * reconstrução, que é o que impede a tela de exibir "0 view" como se fosse
 * ausência de tráfego.
 */
import { describe, it, expect } from "vitest";
import { pareceVazio, temMovimento, reconstruirStats } from "../routes/vturb.js";
import type { VturbSessionStats, VturbStatsByDay } from "../services/vturb.js";

const zerado: VturbSessionStats = {
  total_viewed: 0, total_viewed_device_uniq: 0, total_viewed_session_uniq: 0,
  total_started: 0, total_started_session_uniq: 0, total_started_device_uniq: 0,
  total_finished: 0, total_finished_session_uniq: 0, total_finished_device_uniq: 0,
  engagement_rate: 0, total_clicked: 0, total_clicked_device_uniq: 0,
  total_clicked_session_uniq: 0, total_over_pitch: 0, total_under_pitch: 0,
  over_pitch_rate: 0, total_conversions: 0, overall_conversion_rate: 0,
  total_amount_usd: 0, total_amount_brl: 0, total_amount_eur: 0, play_rate: 0,
};

const dia = (over: Partial<VturbStatsByDay[number]>): VturbStatsByDay[number] =>
  ({ ...zerado, date_key: "2026-08-01", ...over });

describe("reconstrução dos totais da VSL", () => {
  it("reconhece o agregado vazio", () => {
    expect(pareceVazio(zerado)).toBe(true);
    expect(pareceVazio({ ...zerado, total_viewed: 10 })).toBe(false);
  });

  it("só reconstrói quando o diário tem movimento", () => {
    expect(temMovimento([])).toBe(false);
    expect(temMovimento([dia({})])).toBe(false);
    expect(temMovimento([dia({ total_viewed: 1 })])).toBe(true);
  });

  it("soma os contadores dos dias", () => {
    const r = reconstruirStats(
      [
        dia({ date_key: "2026-08-01", total_viewed: 100, total_started: 40, total_clicked: 5, total_conversions: 1, total_amount_brl: 97 }),
        dia({ date_key: "2026-08-02", total_viewed: 300, total_started: 150, total_clicked: 10, total_conversions: 2, total_amount_brl: 194 }),
      ],
      zerado,
    );
    expect(r.total_viewed).toBe(400);
    expect(r.total_started).toBe(190);
    expect(r.total_clicked).toBe(15);
    expect(r.total_conversions).toBe(3);
    expect(r.total_amount_brl).toBe(291);
  });

  it("deriva as taxas dos contadores somados", () => {
    const r = reconstruirStats(
      [dia({ total_viewed: 200, total_started: 100, total_over_pitch: 30, total_under_pitch: 70, total_conversions: 4 })],
      zerado,
    );
    expect(r.play_rate).toBe(50);
    expect(r.over_pitch_rate).toBe(30);
    expect(r.overall_conversion_rate).toBe(2);
  });

  it("pondera o engajamento pela audiência do dia, não pela média simples", () => {
    // Um dia com 10 views e 80% não pode pesar igual a um com 990 views e 10%.
    const r = reconstruirStats(
      [
        dia({ date_key: "2026-08-01", total_viewed: 10, engagement_rate: 80 }),
        dia({ date_key: "2026-08-02", total_viewed: 990, engagement_rate: 10 }),
      ],
      zerado,
    );
    expect(r.engagement_rate).toBeCloseTo(10.7, 1);
    // A média simples daria 45 — o número que a leitura ingênua produziria.
    expect(r.engagement_rate).toBeLessThan(20);
  });

  it("não divide por zero em período sem audiência", () => {
    const r = reconstruirStats([dia({ total_viewed: 0 })], zerado);
    expect(r.play_rate).toBe(0);
    expect(r.engagement_rate).toBe(0);
    expect(Number.isNaN(r.overall_conversion_rate)).toBe(false);
  });
});

describe("o diário vazio com totais cheios — o caso simétrico", () => {
  /**
   * Medido em 2026-09-01, janela de 30 dias, na rota de produção: a PRIMEIRA
   * chamada voltou `byDay: []` com `total_viewed: 7420`; as oito seguintes,
   * todas completas com 32 linhas. O VTurb computa a janela sob demanda, e
   * quem a pede primeiro recebe a resposta incompleta.
   *
   * Na tela isso não parecia erro: os totais certos e todos os gráficos
   * chapados no zero. Trocar para 7 dias e voltar consertava — a pior forma de
   * bug, a que some quando alguém vai investigar.
   */
  it("diário vazio + agregado cheio é detectado como incompleto", () => {
    const cheio = { total_viewed: 7420, total_started: 3184, total_conversions: 0 } as never;
    expect(pareceVazio(cheio)).toBe(false);
    expect(temMovimento([])).toBe(false);
    // As duas condições juntas são o gatilho da segunda tentativa.
    expect(!temMovimento([]) && !pareceVazio(cheio)).toBe(true);
  });

  it("diário com um dia de movimento não dispara nada", () => {
    const cheio = { total_viewed: 7420, total_started: 3184, total_conversions: 0 } as never;
    const dia = [{ date_key: "2026-08-31", total_viewed: 22 }] as never;
    expect(temMovimento(dia)).toBe(true);
    expect(!temMovimento(dia) && !pareceVazio(cheio)).toBe(false);
  });

  it("período realmente sem tráfego não vira aviso falso", () => {
    // Agregado vazio E diário vazio é uma resposta honesta: não houve nada.
    // Avisar aqui treinaria o time a ignorar o aviso.
    const vazio = { total_viewed: 0, total_started: 0, total_conversions: 0 } as never;
    expect(!temMovimento([]) && !pareceVazio(vazio)).toBe(false);
  });
});

describe("os dois vazios com audiência na curva", () => {
  /**
   * O caso que faltava, descrito pelo relato sem saber: "Tempo assistido 0:46"
   * ao lado de "Views 0". Os dois não podem ser verdade ao mesmo tempo — se há
   * gente na curva de retenção, houve tráfego.
   *
   * A janela de 30 dias ficava zerada enquanto 7 e 90 funcionavam, porque
   * quando os DOIS contadores vinham vazios eu concluía "não houve tráfego" e
   * não tentava de novo. A curva vem de outro endpoint e serve de testemunha.
   */
  const vazio = { total_viewed: 0, total_started: 0, total_conversions: 0 } as never;

  const precisaRepetir = (s: VturbSessionStats, d: VturbStatsByDay, usuarios: number) =>
    pareceVazio(s) && !temMovimento(d) && usuarios > 0;

  it("contadores zerados + curva com gente = resposta incompleta", () => {
    expect(precisaRepetir(vazio, [], 812)).toBe(true);
  });

  it("período de verdade sem tráfego não vira tentativa extra", () => {
    // Curva vazia junto com contadores vazios é uma resposta coerente: não
    // houve nada. Insistir aqui gastaria cota do plano por nada.
    expect(precisaRepetir(vazio, [], 0)).toBe(false);
  });

  it("contadores cheios não disparam nada, mesmo com curva cheia", () => {
    const cheio = { total_viewed: 7433, total_started: 3187, total_conversions: 0 } as never;
    expect(precisaRepetir(cheio, [], 812)).toBe(false);
  });
});
