import { describe, it, expect } from "vitest";
import { derivarCadeia } from "../services/vturb-chain.js";
import {
  montarEtapa,
  taxaPublica,
  pitchTimeUtil,
  consultasRestantes,
  quotaComporta,
  NOTA_CONV_POST_PITCH,
} from "../services/vsl-funnel.js";

/**
 * Story 43.5 — funil de VSL no feed público.
 *
 * O handler é uma rota Fastify com banco e chamada externa ao VTurb. O que se
 * testa aqui são as REGRAS que a story introduziu no caminho até o consumidor:
 *
 *   • a forma pública da taxa (valor + motivo + brutos)
 *   • `pitch_time = 0` tratado como ausente, não como zero
 *   • `convPostPitch` sempre null, nunca estimado
 *
 * A cadeia em si (`derivarCadeia`) já tem cobertura própria em
 * `vturb-chain.test.ts`, da Story 29.41 — não é reimplementada nem re-testada.
 *
 * QA-32: na primeira iteração, os testes de AC3 e AC4b verificavam objetos
 * literais criados dentro do próprio teste — passariam mesmo se o endpoint
 * mudasse. Agora exercitam as MESMAS funções que a rota chama
 * (`services/vsl-funnel.ts`).
 */

// Números do teste da Story 29.41, para as duas suítes falarem do mesmo caso.
const stats = {
  total_viewed_device_uniq: 4316,
  total_started_device_uniq: 2211,
  total_over_pitch: 191,
  total_clicked_device_uniq: 88,
} as Parameters<typeof derivarCadeia>[0];

describe("forma pública da taxa (AC2)", () => {
  it("expõe os brutos junto do valor — taxa sozinha não é auditável", () => {
    const c = derivarCadeia(stats, 30);
    const play = taxaPublica(c.playRate);

    expect(play.valor).toBeCloseTo(2211 / 4316, 10);
    expect(play.numerador).toBe(2211);
    expect(play.denominador).toBe(4316);

    // É o que permite conferir contra o painel do VTurb. A 29.41 mediu que as
    // taxas PRONTAS da API divergem dos brutos (8,58 vs 8,639) — com numerador
    // e denominador na resposta, o consumidor refaz a conta e vê qual é qual.
    expect(play.valor).toBeCloseTo(play.numerador / play.denominador, 10);
  });

  it("motivo só aparece quando o valor é null", () => {
    const comValor = taxaPublica(derivarCadeia(stats, 30).playRate);
    expect(comValor).not.toHaveProperty("motivo");
  });
});

describe("pitch_time zero é ausência, não zero (AC5)", () => {
  // A 29.41 mediu: pitch_time = 0 produz Pitch rate de 100% falso.
  const normalizar = (pt: number | null) => (pt && pt > 0 ? pt : null);

  it("zero vira null antes de chegar na cadeia", () => {
    expect(normalizar(0)).toBeNull();
    expect(normalizar(null)).toBeNull();
    expect(normalizar(30)).toBe(30);
  });

  it("sem pitch_time, o pitchRate cai mas o playRate sobrevive", () => {
    const c = derivarCadeia(stats, normalizar(0));
    expect(c.pitchRate.valor).toBeNull();
    expect(c.pitchRate.motivo).toBeTruthy();
    // Perder as duas métricas porque uma configuração falta seria desperdício.
    expect(c.playRate.valor).not.toBeNull();
    expect(c.playRate.valor).toBeCloseTo(2211 / 4316, 10);
  });

  it("com pitch_time configurado, o pitchRate é medido", () => {
    const c = derivarCadeia(stats, normalizar(30));
    expect(c.pitchRate.valor).toBeCloseTo(191 / 2211, 10);
    expect(c.pitchRate.numerador).toBe(191);
  });
});

describe("conversão pós-pitch é declarada ausente, nunca estimada (AC3)", () => {
  it("o denominador existe, mas o valor não", () => {
    const c = derivarCadeia(stats, 30);
    // O VTurb entrega o denominador; o numerador (checkouts iniciados) vem de
    // outro sistema e é manual.
    expect(c.convPostPitchDenominador).toBeGreaterThan(0);
    expect(c).not.toHaveProperty("convPostPitch");
  });

  it("montarEtapa fixa convPostPitch em null — o proxy é calculável e MESMO ASSIM não é usado", () => {
    const c = derivarCadeia(stats, 30);

    // O proxy proibido está ao alcance: clicks ÷ denominador dá um número.
    const proxyProibido = stats.total_clicked_device_uniq / c.convPostPitchDenominador;
    expect(proxyProibido).toBeGreaterThan(0);

    // E a função que a ROTA chama devolve null assim mesmo. Se alguém trocar
    // esse null pelo proxy em vsl-funnel.ts, este teste quebra — que era
    // exatamente o que a versão anterior NÃO fazia (QA-32).
    const etapa = montarEtapa(
      { stageId: "s1", stageName: "VSL", playerId: "p1", playerName: "Player" },
      c,
    );
    expect(etapa.convPostPitch).toBeNull();
    expect(etapa.convPostPitch).not.toBe(proxyProibido);
    expect(etapa.convPostPitchNota).toBe(NOTA_CONV_POST_PITCH);
  });

  it("o denominador é exposto para quem tiver o numerador por fora", () => {
    const etapa = montarEtapa(
      { stageId: "s1", stageName: "VSL", playerId: "p1", playerName: "Player" },
      derivarCadeia(stats, 30),
    );
    expect(etapa.convPostPitchDenominador).toBe(191);
  });
});

describe("quota do VTurb antes do lote (QA-33)", () => {
  it("usa a janela mais apertada, não a primeira", () => {
    const quota = {
      quotas: [
        { queries: { remaining: 100 } },
        { queries: { remaining: 3 } }, // a que manda
      ],
    };
    expect(consultasRestantes(quota)).toBe(3);
  });

  it("sem informação de quota não é o mesmo que sem saldo", () => {
    // Bloquear por falta de informação transformaria uma incerteza em falha.
    expect(consultasRestantes({ quotas: [] })).toBe(Infinity);
  });

  it("comporta quando há saldo para todos os players", () => {
    expect(quotaComporta(6, 6)).toBe(true);
    expect(quotaComporta(10, 6)).toBe(true);
  });

  it("NÃO comporta quando o saldo é menor que o número de etapas", () => {
    // Sem esta checagem, o funil gastaria o saldo restante para colher N falhas
    // opacas — e ninguém saberia que a causa era quota.
    expect(quotaComporta(3, 6)).toBe(false);
  });
});

describe("pitchTimeUtil — a normalização que a rota usa (AC5)", () => {
  it("zero e null viram ausência; positivo passa", () => {
    // A rota chama ESTA função; trocar a regra aqui quebra o teste.
    expect(pitchTimeUtil(0)).toBeNull();
    expect(pitchTimeUtil(null)).toBeNull();
    expect(pitchTimeUtil(undefined)).toBeNull();
    expect(pitchTimeUtil(30)).toBe(30);
  });

  it("o resultado alimenta a cadeia preservando o playRate", () => {
    const c = derivarCadeia(stats, pitchTimeUtil(0));
    const etapa = montarEtapa(
      { stageId: "s1", stageName: "VSL", playerId: "p1", playerName: "Player" },
      c,
    );
    expect(etapa.pitchRate.valor).toBeNull();
    expect(etapa.pitchRate.motivo).toBeTruthy();
    expect(etapa.playRate.valor).not.toBeNull();
  });
});
