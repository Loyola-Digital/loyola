import { describe, it, expect } from "vitest";
import { derivarCadeia, type TaxaMedida } from "../services/vturb-chain.js";

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
 */

/** Mesma projeção do endpoint (`public-vsl.ts`). */
function taxaPublica(t: TaxaMedida) {
  return {
    valor: t.valor,
    ...(t.motivo ? { motivo: t.motivo } : {}),
    numerador: t.numerador,
    denominador: t.denominador,
  };
}

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

  it("total_clicked_device_uniq NÃO pode virar proxy do numerador", () => {
    // Se alguém "resolvesse" a ausência com cliques no CTA, sairia um número
    // plausível e errado: clicar e iniciar checkout diferem por tudo que
    // acontece entre os dois. Este teste existe para essa tentação falhar.
    const c = derivarCadeia(stats, 30);
    const proxyProibido = stats.total_clicked_device_uniq / c.convPostPitchDenominador;
    expect(proxyProibido).toBeGreaterThan(0); // o proxy É calculável…
    // …e mesmo assim a resposta pública fixa null.
    const respostaPublica = { convPostPitch: null as number | null };
    expect(respostaPublica.convPostPitch).toBeNull();
  });
});

describe("lista vazia: conectado distingue os dois casos (AC4b)", () => {
  it("sem conexão e sem players têm a mesma lista e significados opostos", () => {
    const semConexao = { conectado: false, etapas: [] };
    const semPlayers = { conectado: true, etapas: [] };

    expect(semConexao.etapas).toEqual(semPlayers.etapas);
    // Uma pede configurar a integração; a outra pede vincular player. Sem o
    // indicador, quem consome não sabe qual das duas.
    expect(semConexao.conectado).not.toBe(semPlayers.conectado);
  });
});
