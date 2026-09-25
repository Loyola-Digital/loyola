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

// ============================================================
// Story 29.81 (AC8) — o feed passa a ter a Retenção ao pitch "igual o VTurb".
// ============================================================

import { fracaoTruncada } from "@loyola-x/shared";
import {
  montarEtapaDoFeed,
  retencaoDoVturb,
  lerEtapasDoFeed,
  PITCH_RATE_BASE,
  type VinculoDoFeed,
} from "../services/vsl-funnel.js";

// NETÃO (medido em 23/09): over + under = 4.032 contra 3.903 plays únicos.
const netao = {
  total_viewed_device_uniq: 9000,
  total_started_device_uniq: 3903,
  total_over_pitch: 225,
  total_under_pitch: 3807,
  total_clicked_device_uniq: 88,
} as Parameters<typeof derivarCadeia>[0];

// PPS: 13/164 = 7,9268 % — truncar dá 7,92, arredondar daria 7,93.
const pps = {
  total_viewed_device_uniq: 500,
  total_started_device_uniq: 170,
  total_over_pitch: 13,
  total_under_pitch: 151,
} as Parameters<typeof derivarCadeia>[0];

const info = { stageId: "s1", stageName: "VSL", playerId: "p1", playerName: "NETÃO VSL V2.mp4" };

describe("Story 29.81 (AC8) — Retenção igual ao VTurb no feed", () => {
  it("a fração truncada do shared: 225/4032 → 0,0558 · 13/164 → 0,0792 (não 0,0793)", () => {
    expect(fracaoTruncada(225, 4032)).toBe(0.0558);
    expect(fracaoTruncada(13, 164)).toBe(0.0792);
    expect(fracaoTruncada(57, 100)).toBe(0.57); // o caso em que o piso em ponto flutuante dava 0,5699
    expect(fracaoTruncada(1, 0)).toBeNull();
  });

  it("NETÃO: 5,58 % sobre over + under — voltar aos plays únicos (5,76 %) derruba", () => {
    const r = retencaoDoVturb(netao, 160);
    expect(r).toEqual({ valor: 0.0558, numerador: 225, denominador: 4032 });
    expect(r.valor).not.toBeCloseTo(225 / 3903, 4);
  });

  it("truncada, não arredondada: PPS 0,0792", () => {
    expect(retencaoDoVturb(pps, 90).valor).toBe(0.0792);
  });

  it("pitch 0 ou ausente: valor null com o motivo — nunca 100 % nem 0 %", () => {
    for (const pitch of [null, 0]) {
      const r = retencaoDoVturb(netao, pitch);
      expect(r.valor).toBeNull();
      expect(r.motivo).toBe("pitch_time não configurado no VTurb");
    }
  });

  it("denominador zero é ausência, não taxa zero", () => {
    const r = retencaoDoVturb({ ...netao, total_over_pitch: 0, total_under_pitch: 0 }, 160);
    expect(r.valor).toBeNull();
    expect(r.motivo).toMatch(/denominador zero/);
  });
});

describe("Story 29.81 (AC8) — diferencial: com os mesmos brutos, SÓ o pitchRate muda", () => {
  it("playRate, convPostPitch* e as demais chaves são idênticos aos de antes", () => {
    const antes = montarEtapa(info, derivarCadeia(netao, 160));
    const depois = montarEtapaDoFeed(info, netao, 160);
    const { pitchRate: pitchAntes, ...restoAntes } = antes;
    const { pitchRate: pitchDepois, ...restoDepois } = depois;
    expect(restoDepois).toEqual(restoAntes);
    expect(Object.keys(depois).sort()).toEqual(Object.keys(antes).sort());
    // E o que mudou é exatamente a base: 225/3903 (5,76 %) → 225/4032 truncado (5,58 %).
    expect(pitchAntes.valor).toBeCloseTo(225 / 3903, 10);
    expect(pitchDepois).toEqual({ valor: 0.0558, numerador: 225, denominador: 4032 });
    // A cadeia do feed deixa de multiplicar — é o que `pitchRateBase` declara.
    expect(pitchDepois.denominador).not.toBe(depois.playRate.numerador);
  });

  it("sem pitch, as duas montagens concordam em tudo, inclusive na ausência", () => {
    const antes = montarEtapa(info, derivarCadeia(netao, null));
    const depois = montarEtapaDoFeed(info, netao, null);
    expect(depois.playRate).toEqual(antes.playRate);
    expect(depois.convPostPitchDenominador).toBe(0);
    expect(depois.pitchRate.valor).toBeNull();
    expect(depois.pitchRate.motivo).toBe(antes.pitchRate.motivo);
  });

  it("a base declarada diz a fórmula, o truncamento e o pitch atual", () => {
    expect(PITCH_RATE_BASE.formula).toBe("total_over_pitch ÷ (total_over_pitch + total_under_pitch)");
    expect(PITCH_RATE_BASE.arredondamento).toMatch(/truncado/);
    expect(PITCH_RATE_BASE.pitch).toMatch(/ATUAL/);
    expect(PITCH_RATE_BASE.nota).toMatch(/não se multiplicam/);
  });
});

describe("Story 29.81 (AC8) — o laço da rota (`lerEtapasDoFeed`)", () => {
  const vinculos: VinculoDoFeed[] = [
    // A CÓPIA do pitch no vínculo é 0 (498 de 574 players em 23/09); o VTurb diz 160.
    { stageId: "s1", stageName: "VSL A", playerId: "pA", playerName: "NETÃO", duration: 1200, pitchTime: 0 },
    { stageId: "s2", stageName: "VSL B", playerId: "pB", playerName: "PPS", duration: 900, pitchTime: 45 },
  ];
  const daConta = [
    { id: "pA", pitch_time: 160 },
    { id: "pB", pitch_time: 90 },
  ];
  const statsPor: Record<string, typeof netao> = { pA: netao, pB: pps };

  function ler(overrides: Partial<Parameters<typeof lerEtapasDoFeed>[0]> = {}) {
    const chamadas: { playerId: string; pitchTime: number | null }[] = [];
    const resultado = lerEtapasDoFeed({
      vinculos,
      listarPlayers: async () => daConta,
      lerStats: async (v) => {
        chamadas.push({ playerId: v.playerId, pitchTime: v.pitchTime });
        return statsPor[v.playerId]!;
      },
      ...overrides,
    });
    return { resultado, chamadas };
  }

  it("2 vídeos → 2 linhas, uma por vínculo (somar os vídeos derruba)", async () => {
    const { resultado } = ler();
    const { etapas, falhas } = await resultado;
    expect(falhas).toEqual([]);
    expect(etapas.map((e) => e.playerId)).toEqual(["pA", "pB"]);
    expect(etapas[0]!.pitchRate).toEqual({ valor: 0.0558, numerador: 225, denominador: 4032 });
    expect(etapas[1]!.pitchRate).toEqual({ valor: 0.0792, numerador: 13, denominador: 164 });
    expect(etapas[0]!.playRate.numerador).toBe(3903);
    expect(etapas[1]!.playRate.numerador).toBe(170);
  });

  it("o pitch ENVIADO ao sessions/stats e usado na regra é o ATUAL, nunca a cópia do vínculo", async () => {
    const { resultado, chamadas } = ler();
    const { etapas } = await resultado;
    expect(chamadas).toEqual([
      { playerId: "pA", pitchTime: 160 },
      { playerId: "pB", pitchTime: 90 },
    ]);
    // Com a cópia (0) o NETÃO sairia sem Retenção; com o atual, sai medido.
    expect(etapas[0]!.pitchRate.valor).toBe(0.0558);
    expect(etapas[0]!.convPostPitchDenominador).toBe(225);
  });

  it("vídeo com pitch 0 no VTurb (ou fora da conta): Retenção null com motivo, playRate segue", async () => {
    const { resultado } = ler({ listarPlayers: async () => [{ id: "pA", pitch_time: 0 }] });
    const { etapas } = await resultado;
    expect(etapas).toHaveLength(2);
    for (const e of etapas) {
      expect(e.pitchRate.valor).toBeNull();
      expect(e.pitchRate.motivo).toBe("pitch_time não configurado no VTurb");
      expect(e.playRate.valor).not.toBeNull();
    }
  });

  it("falha da /players/list SOBE (a rota responde com o status do VTurb) — sem cair na cópia", async () => {
    const { resultado, chamadas } = ler({
      listarPlayers: async () => {
        throw new Error("VTurb 503");
      },
    });
    await expect(resultado).rejects.toThrow("VTurb 503");
    expect(chamadas).toEqual([]);
  });

  it("falha de um vídeo vira aviso; a outra linha segue", async () => {
    const { resultado } = ler({
      lerStats: async (v) => {
        if (v.playerId === "pA") throw new Error("timeout");
        return pps;
      },
    });
    const { etapas, falhas } = await resultado;
    expect(etapas.map((e) => e.playerId)).toEqual(["pB"]);
    expect(falhas).toMatchObject([{ stageId: "s1", playerId: "pA", motivo: "não foi possível consultar o VTurb para esta etapa" }]);
  });
});
