// ============================================================
// Story 43.5 — montagem da resposta do funil de VSL.
//
// Separado da rota por um motivo concreto: o QA-32 mostrou que testar a decisão
// "convPostPitch é sempre null" olhando um objeto literal dentro do teste não
// protege nada — trocar o `null` pelo proxy de cliques manteria o teste verde.
//
// Com a montagem aqui, o teste chama a MESMA função que a rota chama. Se alguém
// resolver a ausência com `total_clicked_device_uniq`, o teste quebra.
//
// Tudo puro. Nenhuma I/O.
// ============================================================

import type { CadeiaVturb, TaxaMedida } from "./vturb-chain.js";

/** Forma pública de uma taxa: nunca só o valor. */
export interface TaxaPublica {
  valor: number | null;
  motivo?: string;
  numerador: number;
  denominador: number;
}

export interface EtapaVsl {
  stageId: string;
  stageName: string;
  playerId: string;
  playerName: string;
  playRate: TaxaPublica;
  pitchRate: TaxaPublica;
  /** SEMPRE `null` — ver `montarEtapa`. */
  convPostPitch: null;
  convPostPitchDenominador: number;
  convPostPitchNota: string;
}

export const NOTA_CONV_POST_PITCH =
  "numerador (checkouts iniciados) vem de outro sistema e não é automatizado";

/**
 * Projeta a taxa com os brutos junto.
 *
 * Taxa sozinha não é auditável: quem recebe 8,639% não sabe se são 191/2211 ou
 * 19/220. A Story 29.41 mediu que as taxas PRONTAS da API do VTurb divergem dos
 * brutos (8,58 vs 8,639) — com numerador e denominador na resposta, o consumidor
 * refaz a conta e vê qual é qual.
 */
export function taxaPublica(t: TaxaMedida): TaxaPublica {
  return {
    valor: t.valor,
    ...(t.motivo ? { motivo: t.motivo } : {}),
    numerador: t.numerador,
    denominador: t.denominador,
  };
}

/**
 * Monta a etapa exposta a partir da cadeia calculada.
 *
 * `convPostPitch` é `null` FIXO, e é a decisão central desta story. O numerador
 * (checkouts iniciados) vem de outro sistema e é manual. `total_clicked_device_uniq`
 * está disponível, é calculável, e NÃO serve de proxy: clicar no CTA e iniciar
 * checkout diferem por tudo que acontece entre os dois. Um número plausível e
 * errado aqui é pior que a ausência declarada.
 */
export function montarEtapa(
  info: { stageId: string; stageName: string; playerId: string; playerName: string },
  cadeia: CadeiaVturb,
): EtapaVsl {
  return {
    ...info,
    playRate: taxaPublica(cadeia.playRate),
    pitchRate: taxaPublica(cadeia.pitchRate),
    convPostPitch: null,
    convPostPitchDenominador: cadeia.convPostPitchDenominador,
    convPostPitchNota: NOTA_CONV_POST_PITCH,
  };
}

/**
 * `pitch_time` utilizável, ou `null`.
 *
 * Zero NÃO é um pitch time válido — a Story 29.41 mediu que ele produz Pitch
 * rate de 100% falso. Tratado como ausente, a cadeia devolve `pitchRate` nulo
 * com motivo e PRESERVA o `playRate`: perder as duas métricas porque falta uma
 * configuração seria desperdício.
 */
export function pitchTimeUtil(pitchTime: number | null | undefined): number | null {
  return pitchTime && pitchTime > 0 ? pitchTime : null;
}

/**
 * Quantas consultas restam na janela de quota do VTurb.
 *
 * A API devolve várias janelas (por intervalo); a que importa é a mais
 * apertada — se qualquer uma zerou, a próxima chamada falha.
 */
export function consultasRestantes(quota: { quotas: { queries: { remaining: number } }[] }): number {
  if (!quota.quotas?.length) return Infinity; // sem informação não é o mesmo que sem saldo
  return Math.min(...quota.quotas.map((q) => q.queries.remaining));
}

/**
 * A quota comporta consultar todos os players?
 *
 * Sem esta checagem, um projeto perto do limite veria N falhas opacas ("não foi
 * possível consultar") em vez de um aviso dizendo que era quota — e ainda teria
 * gasto o resto do saldo tentando.
 */
export function quotaComporta(restantes: number, players: number): boolean {
  return restantes >= players;
}
