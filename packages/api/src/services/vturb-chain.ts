// ============================================================
// Story 29.41 — as taxas da cadeia de conversão medidas pelo VTurb.
//
// Este módulo faz UMA coisa: transformar os brutos de `/sessions/stats` nas
// taxas que os estágios de VSL da 29.36 definem. Fica separado do cliente HTTP
// porque é regra de domínio — o que conta como "play" e o que conta como
// "chegou ao pitch" é definição do protocolo, não da API.
//
// DUAS REGRAS QUE NÃO PODEM SER RELAXADAS:
//
// 1. DERIVAR DOS BRUTOS, NUNCA USAR AS TAXAS PRONTAS.
//    A API entrega `play_rate` e `over_pitch_rate` já calculados. Usá-los
//    violaria ROUND-01 (arredondar só no fim) e — pior — aceitaria a definição
//    do VTurb no lugar da definição do estágio.
//
//    Isso não é preocupação teórica. Medição real (player NETÃO VSL V2,
//    janela 2026-07-07→2026-08-06):
//
//      brutos: viewed_uniq=4316 · started_uniq=2211 · over_pitch=191
//      derivado : 191/2211 = 8,64%
//      API diz  : over_pitch_rate = "8.58"
//
//    0,06 pontos percentuais NÃO saem de arredondar 191/2211. A API está
//    usando numerador ou denominador diferente do que o estágio define. Quem
//    consumir a taxa pronta está lendo outra métrica com o mesmo nome.
//
// 2. DENOMINADOR ZERO É INPUT AUSENTE, NUNCA UMA DIVISÃO.
//    Zero pageviews não significa "taxa de play igual a zero" — significa que
//    não houve medição. GR-01: não preencher o que falta.
// ============================================================

import type { VturbSessionStats } from "./vturb.js";

/** Motivo pelo qual uma taxa não pôde ser medida. Vira texto na tela. */
export type MotivoAusencia =
  | "denominador zero — não houve medição na janela"
  | "pitch_time não configurado no VTurb";

export interface TaxaMedida {
  /** Fração em [0,1]. `null` quando ausente — nunca 0 para significar ausência. */
  valor: number | null;
  /** Preenchido só quando `valor` é null. */
  motivo?: MotivoAusencia;
  /** Os brutos que produziram a taxa, para o memorial poder mostrar a conta. */
  numerador: number;
  denominador: number;
}

export interface CadeiaVturb {
  playRate: TaxaMedida;
  pitchRate: TaxaMedida;
  /**
   * Denominador de `conv_post_pitch`. O numerador (checkouts iniciados) é de
   * outro sistema e continua manual — ver AC4. `total_clicked_device_uniq`
   * NÃO serve como proxy: clicar no CTA e iniciar checkout diferem por tudo
   * que acontece entre os dois.
   */
  convPostPitchDenominador: number;
}

/**
 * Erro de violação do protocolo. Aborta em vez de degradar, porque uma taxa
 * fora de [0,1] indica que a definição está errada — e um número errado que
 * parece certo é pior que a ausência dele.
 */
export class ProtocolViolation extends Error {
  constructor(campo: string, valor: number) {
    super(`${campo} = ${valor} fora de [0,1]. Verifique a definição do estágio contra os brutos do VTurb.`);
    this.name = "ProtocolViolation";
  }
}

function taxa(numerador: number, denominador: number, campo: string): TaxaMedida {
  if (!Number.isFinite(denominador) || denominador <= 0) {
    return {
      valor: null,
      motivo: "denominador zero — não houve medição na janela",
      numerador,
      denominador: Math.max(0, denominador || 0),
    };
  }
  const v = numerador / denominador;
  // Numerador maior que denominador significa que os dois campos não são o par
  // que o estágio define. Abortar aqui é o que impede a tela de exibir 137%
  // como se fosse informação.
  if (v < 0 || v > 1) throw new ProtocolViolation(campo, v);
  return { valor: v, numerador, denominador };
}

/**
 * Deriva a cadeia a partir dos brutos.
 *
 * @param stats     resposta de `/sessions/stats`
 * @param pitchTime `pitch_time` do player, em segundos
 *
 * CHAIN-01 — a propriedade que torna a cadeia multiplicável: o numerador de
 * `playRate` (`total_started_device_uniq`) É o denominador de `pitchRate`. As
 * duas linhas abaixo usam literalmente a mesma variável, e o teste de cadeia
 * trava isso.
 */
export function derivarCadeia(stats: VturbSessionStats, pitchTime: number | null): CadeiaVturb {
  const viewedUniq = Number(stats.total_viewed_device_uniq ?? 0);
  const startedUniq = Number(stats.total_started_device_uniq ?? 0);
  const overPitch = Number(stats.total_over_pitch ?? 0);

  const playRate = taxa(startedUniq, viewedUniq, "play_rate");

  // AC2: sem pitch_time válido não existe "chegou ao pitch". Com pitch_time=0
  // todo mundo que deu play está tecnicamente acima do pitch, a taxa dá ~100%
  // e o número é plausível e vazio — exatamente o que GR-01 proíbe. Não
  // calculamos, e dizemos por quê.
  const pitchInvalido = pitchTime == null || !Number.isFinite(pitchTime) || pitchTime <= 0;
  const pitchRate: TaxaMedida = pitchInvalido
    ? {
        valor: null,
        motivo: "pitch_time não configurado no VTurb",
        numerador: overPitch,
        denominador: startedUniq,
      }
    : taxa(overPitch, startedUniq, "pitch_rate");

  return {
    playRate,
    // CHAIN-01: `startedUniq` aparece como numerador acima e denominador aqui.
    pitchRate,
    convPostPitchDenominador: pitchInvalido ? 0 : overPitch,
  };
}

/**
 * Proveniência da taxa medida (AC5). O comentário do `cac-protocol.ts:306` é
 * explícito sobre o formato: *"Sistema + tela + coluna. 'VTurb' sozinho é
 * insuficiente"* — quem for conferir daqui a três meses precisa saber
 * exatamente onde olhar.
 */
export function fonteVturb(playerNome: string, playerId: string): string {
  return `VTurb — /sessions/stats — player ${playerNome} (${playerId})`;
}
