import { describe, it, expect } from "vitest";
import { derivarCadeia, fonteVturb, ProtocolViolation } from "../services/vturb-chain.js";
import type { VturbSessionStats } from "../services/vturb.js";

/** Stats com os campos que a cadeia usa; o resto zerado. */
const stats = (over: Partial<VturbSessionStats>): VturbSessionStats =>
  ({
    total_viewed: 0, total_viewed_device_uniq: 0, total_viewed_session_uniq: 0,
    total_started: 0, total_started_session_uniq: 0, total_started_device_uniq: 0,
    total_finished: 0, total_finished_session_uniq: 0, total_finished_device_uniq: 0,
    engagement_rate: 0, total_clicked: 0, total_clicked_device_uniq: 0,
    total_clicked_session_uniq: 0, total_over_pitch: 0, total_under_pitch: 0,
    over_pitch_rate: 0, total_conversions: 0, overall_conversion_rate: 0,
    total_amount_usd: 0, total_amount_brl: 0, total_amount_eur: 0, play_rate: 0,
    ...over,
  }) as VturbSessionStats;

describe("derivarCadeia — Story 29.41", () => {
  describe("AC3 — taxas derivadas dos brutos", () => {
    // Números REAIS medidos no player NETÃO VSL V2 (janela 2026-07-07→2026-08-06).
    const reais = stats({
      total_viewed_device_uniq: 4316,
      total_started_device_uniq: 2211,
      total_over_pitch: 191,
      play_rate: 51.22,        // o que a API entrega, e que NÃO usamos
      over_pitch_rate: 8.58,   // idem
    });

    it("play_rate vem de started_uniq / viewed_uniq", () => {
      const c = derivarCadeia(reais, 160);
      expect(c.playRate.valor).toBeCloseTo(2211 / 4316, 10);
      expect(c.playRate.numerador).toBe(2211);
      expect(c.playRate.denominador).toBe(4316);
    });

    it("pitch_rate vem de over_pitch / started_uniq", () => {
      const c = derivarCadeia(reais, 160);
      expect(c.pitchRate.valor).toBeCloseTo(191 / 2211, 10);
    });

    it("IGNORA as taxas prontas da API — elas divergem da definição do estágio", () => {
      // Este é o teste que justifica a regra. A API diz over_pitch_rate=8.58;
      // 191/2211 = 8,64%. A diferença de 0,06 pp não é arredondamento — é
      // outra definição. Se alguém "simplificar" usando o campo pronto, aqui quebra.
      const c = derivarCadeia(reais, 160);
      expect(c.pitchRate.valor! * 100).toBeCloseTo(8.639, 2);
      expect(c.pitchRate.valor! * 100).not.toBeCloseTo(8.58, 2);
    });

    it("não arredonda no meio do caminho (ROUND-01)", () => {
      const c = derivarCadeia(reais, 160);
      // 2211/4316 = 0.5122798887859129 — a precisão inteira chega ao consumidor.
      // Arredondar aqui é o que a API já faz ("51.22"); o protocolo manda
      // arredondar só na exibição.
      expect(c.playRate.valor).not.toBe(0.5123);
      expect(c.playRate.valor).not.toBe(0.5122);
      expect(String(c.playRate.valor)).toBe("0.5122798887859129");
    });
  });

  describe("CHAIN-01 — a cadeia é multiplicável", () => {
    it("o numerador de play_rate É o denominador de pitch_rate", () => {
      const c = derivarCadeia(
        stats({ total_viewed_device_uniq: 1000, total_started_device_uniq: 400, total_over_pitch: 100 }),
        160,
      );
      expect(c.playRate.numerador).toBe(c.pitchRate.denominador);
    });

    it("multiplicar os elos dá a taxa ponta a ponta", () => {
      const c = derivarCadeia(
        stats({ total_viewed_device_uniq: 1000, total_started_device_uniq: 400, total_over_pitch: 100 }),
        160,
      );
      // 0,4 × 0,25 = 0,10 — e 100/1000 = 0,10. É isso que CHAIN-01 garante.
      expect(c.playRate.valor! * c.pitchRate.valor!).toBeCloseTo(100 / 1000, 10);
    });
  });

  describe("AC2 — pitch_time inválido bloqueia, não estima", () => {
    const base = stats({
      total_viewed_device_uniq: 1000, total_started_device_uniq: 400, total_over_pitch: 400,
    });

    it.each([[0], [null], [-5], [NaN]])("pitch_time = %s marca ausente e NÃO calcula", (pt) => {
      const c = derivarCadeia(base, pt as number | null);
      expect(c.pitchRate.valor).toBeNull();
      expect(c.pitchRate.motivo).toBe("pitch_time não configurado no VTurb");
    });

    it("com pitch_time=0 a taxa DARIA 100% — plausível e sem significado", () => {
      // over_pitch === started: todo mundo "passou do pitch" porque o pitch é 0.
      // É este número convincente que o bloqueio existe para impedir.
      const c = derivarCadeia(base, 0);
      expect(c.pitchRate.valor).toBeNull();
      // e o denominador do estágio seguinte também não é oferecido
      expect(c.convPostPitchDenominador).toBe(0);
    });

    it("play_rate continua medido — ele não depende do pitch", () => {
      const c = derivarCadeia(base, 0);
      expect(c.playRate.valor).toBeCloseTo(0.4, 10);
    });

    it("pitch_time válido calcula normalmente", () => {
      const c = derivarCadeia(base, 160);
      expect(c.pitchRate.valor).toBeCloseTo(1, 10);
      expect(c.convPostPitchDenominador).toBe(400);
    });
  });

  describe("denominador zero é ausência, não zero", () => {
    it("viewed_uniq = 0 → play_rate ausente, sem divisão por zero", () => {
      const c = derivarCadeia(stats({ total_viewed_device_uniq: 0, total_started_device_uniq: 0 }), 160);
      expect(c.playRate.valor).toBeNull();
      expect(c.playRate.motivo).toBe("denominador zero — não houve medição na janela");
    });

    it("started_uniq = 0 → pitch_rate ausente", () => {
      const c = derivarCadeia(
        stats({ total_viewed_device_uniq: 500, total_started_device_uniq: 0, total_over_pitch: 0 }),
        160,
      );
      expect(c.pitchRate.valor).toBeNull();
    });

    it("nunca devolve Infinity nem NaN", () => {
      const c = derivarCadeia(stats({}), 160);
      for (const t of [c.playRate, c.pitchRate]) {
        expect(t.valor === null || Number.isFinite(t.valor)).toBe(true);
      }
    });
  });

  describe("taxa fora de [0,1] aborta", () => {
    it("numerador maior que denominador é ProtocolViolation", () => {
      expect(() =>
        derivarCadeia(stats({ total_viewed_device_uniq: 100, total_started_device_uniq: 150 }), 160),
      ).toThrow(ProtocolViolation);
    });

    it("a mensagem diz o campo e o valor, para dar o que investigar", () => {
      try {
        derivarCadeia(stats({ total_viewed_device_uniq: 100, total_started_device_uniq: 150 }), 160);
        expect.unreachable("deveria ter abortado");
      } catch (e) {
        expect((e as Error).message).toContain("play_rate");
        expect((e as Error).message).toContain("1.5");
      }
    });
  });

  describe("AC4 — conv_post_pitch só entrega o denominador", () => {
    it("o denominador medido é total_over_pitch", () => {
      const c = derivarCadeia(
        stats({ total_viewed_device_uniq: 1000, total_started_device_uniq: 400, total_over_pitch: 90 }),
        160,
      );
      expect(c.convPostPitchDenominador).toBe(90);
    });

    it("cliques no CTA NÃO entram na cadeia — não são checkout iniciado", () => {
      const c = derivarCadeia(
        stats({
          total_viewed_device_uniq: 1000, total_started_device_uniq: 400,
          total_over_pitch: 90, total_clicked_device_uniq: 55,
        }),
        160,
      );
      // 55 não pode aparecer em lugar nenhum do resultado
      expect(JSON.stringify(c)).not.toContain("55");
    });
  });

  describe("AC5 — proveniência", () => {
    it("nomeia sistema, endpoint e player — 'VTurb' sozinho é insuficiente", () => {
      const f = fonteVturb("NETÃO VSL V2.mp4", "6a5d2cf1926e614c3a7b20ee");
      expect(f).toContain("VTurb");
      expect(f).toContain("/sessions/stats");
      expect(f).toContain("NETÃO VSL V2.mp4");
      expect(f).toContain("6a5d2cf1926e614c3a7b20ee");
    });
  });
});
