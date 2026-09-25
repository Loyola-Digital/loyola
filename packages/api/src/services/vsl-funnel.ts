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
// Tudo puro. Nenhuma I/O — a de `lerEtapasDoFeed` é injetada.
//
// Story 29.81 (AC8) — o `pitchRate` do feed passa a ser a Retenção ao pitch
// "igual o VTurb": over ÷ (over + under), TRUNCADA em centésimos de ponto
// percentual, com o pitch ATUAL do VTurb. Sai de `retencaoDoVturb`, função
// nova — `derivarCadeia` não muda (a cadeia da Análise MVP segue nela, AC5).
// Uma linha por vínculo etapa↔vídeo, como antes: a soma dos vídeos não foi
// pedida para o feed.
// ============================================================

import { fracaoTruncada } from "@loyola-x/shared";
import { derivarCadeia, pitchInvalido, ProtocolViolation, type CadeiaVturb, type TaxaMedida } from "./vturb-chain.js";
import { pitchAtualDoPlayer } from "./vturb-tabela.js";
import type { VturbPlayer, VturbSessionStats } from "./vturb.js";

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

/**
 * Story 29.81 (AC8) — a declaração da base do `pitchRate`, num campo ADITIVO da
 * resposta (`pitchRateBase`).
 *
 * A chave `pitchRate` continua a mesma e o número muda: é a armadilha "outra
 * métrica com o mesmo nome" que `vturb-chain.ts` registra. Quem consome o feed
 * (o Slide 20, por chave de API) precisa saber que a base mudou e que
 * `pitchRate.denominador` deixou de ser `playRate.numerador` — as taxas do feed
 * não se multiplicam mais.
 */
export const PITCH_RATE_BASE = {
  metrica: "retencao_ao_pitch_vturb",
  formula: "total_over_pitch ÷ (total_over_pitch + total_under_pitch)",
  arredondamento: "truncado em centésimos de ponto percentual (valor com 4 casas), igual ao painel do VTurb",
  pitch: "pitch_time ATUAL do player no VTurb (/players/list), não a cópia gravada no vínculo",
  desde: "Story 29.81 (contrato v27). Antes: total_over_pitch ÷ total_started_device_uniq, com a cópia do pitch.",
  nota: "pitchRate.denominador (acima + abaixo do pitch) não é playRate.numerador (plays únicos): as taxas do feed não se multiplicam.",
} as const;

const MOTIVO_SEM_PITCH_DO_FEED = "pitch_time não configurado no VTurb";

/**
 * Story 29.81 (AC8) — a Retenção ao pitch "igual o VTurb" de UM vídeo.
 *
 * `over ÷ (over + under)`, truncada com a mesma conta inteira da tabela das
 * VSLs (`fracaoTruncada`, shared): 225/4032 → 0,0558; 13/164 → 0,0792, e não
 * 0,0793. Pitch 0 ou ausente → `valor: null` com o motivo (com pitch 0 o VTurb
 * conta todo mundo "acima", ~100 % falso). Denominador zero → ausência.
 */
export function retencaoDoVturb(stats: VturbSessionStats, pitchTimeAtual: number | null): TaxaPublica {
  const over = Number(stats.total_over_pitch ?? 0);
  const under = Number(stats.total_under_pitch ?? 0);
  const denominador = over + under;
  if (pitchInvalido(pitchTimeAtual)) {
    return { valor: null, motivo: MOTIVO_SEM_PITCH_DO_FEED, numerador: over, denominador: Math.max(0, denominador || 0) };
  }
  if (!(denominador > 0)) {
    return { valor: null, motivo: "denominador zero — não houve medição na janela", numerador: over, denominador: 0 };
  }
  const valor = fracaoTruncada(over, denominador);
  if (valor === null) {
    return { valor: null, motivo: "brutos do VTurb não são contagens válidas", numerador: over, denominador };
  }
  return { valor, numerador: over, denominador };
}

/**
 * Story 29.81 (AC8) — a linha do feed: a de sempre (`montarEtapa` sobre
 * `derivarCadeia`, com o pitch ATUAL), trocando SÓ o `pitchRate` pela
 * Retenção do VTurb. `playRate`, `convPostPitch*` e o conjunto de linhas não
 * mudam — o teste diferencial compara as duas montagens com os mesmos brutos.
 */
export function montarEtapaDoFeed(
  info: { stageId: string; stageName: string; playerId: string; playerName: string },
  stats: VturbSessionStats,
  pitchTimeAtual: number | null,
): EtapaVsl {
  const cadeia = derivarCadeia(stats, pitchTimeAtual);
  return { ...montarEtapa(info, cadeia), pitchRate: retencaoDoVturb(stats, pitchTimeAtual) };
}

/** Um vínculo etapa↔vídeo do projeto, como sai do banco. */
export interface VinculoDoFeed {
  stageId: string;
  stageName: string;
  playerId: string;
  playerName: string;
  duration: number | null;
  /** A CÓPIA do pitch gravada no vínculo. NÃO é usada (AC8) — está aqui para o teste provar isso. */
  pitchTime: number | null;
}

export interface FalhaDaEtapa {
  stageId: string;
  playerId: string;
  motivo: string;
  err: unknown;
}

/**
 * Story 29.81 (AC8) — as linhas do feed, com as chamadas ao VTurb injetadas
 * (padrão de `lerTabelaDasVsls`, 29.78), para o teste exercitar o laço que a
 * rota roda:
 *
 * - UMA `/players/list` para o pitch ATUAL de todos; se falhar, a exceção
 *   SOBE — a rota responde com o status do VTurb. Nunca a cópia do vínculo.
 * - UMA linha por vínculo, na ordem do banco (sem soma — decisão 3).
 * - o pitch enviado ao `sessions/stats` é o atual: é ele que define over/under.
 * - falha de um vínculo vira `falhas` (o motivo vai para `avisos`); as outras
 *   linhas seguem. Mesmo motivo de antes (`ProtocolViolation` × consulta).
 */
export async function lerEtapasDoFeed(input: {
  vinculos: readonly VinculoDoFeed[];
  listarPlayers: () => Promise<Pick<VturbPlayer, "id" | "pitch_time">[]>;
  lerStats: (v: { playerId: string; pitchTime: number | null; videoDuration: number | null }) => Promise<VturbSessionStats>;
}): Promise<{ etapas: EtapaVsl[]; falhas: FalhaDaEtapa[] }> {
  const daConta = new Map((await input.listarPlayers()).map((pl) => [pl.id, pl]));
  const etapas: EtapaVsl[] = [];
  const falhas: FalhaDaEtapa[] = [];
  for (const v of input.vinculos) {
    try {
      // Pitch 0, ausente ou vídeo fora da conta → `null` (regra `pitchInvalido`).
      const { pitchTime } = pitchAtualDoPlayer(daConta.get(v.playerId));
      const stats = await input.lerStats({ playerId: v.playerId, pitchTime, videoDuration: v.duration });
      etapas.push(
        montarEtapaDoFeed(
          { stageId: v.stageId, stageName: v.stageName, playerId: v.playerId, playerName: v.playerName },
          stats,
          pitchTime,
        ),
      );
    } catch (err) {
      // `derivarCadeia` ABORTA em taxa fora de [0,1] em vez de degradar — uma
      // etapa com dado inconsistente não pode derrubar a resposta inteira.
      const motivo =
        err instanceof ProtocolViolation
          ? `dado inconsistente do VTurb: ${err.message}`
          : "não foi possível consultar o VTurb para esta etapa";
      falhas.push({ stageId: v.stageId, playerId: v.playerId, motivo, err });
    }
  }
  return { etapas, falhas };
}
