/**
 * Story 42.14 (D17, AC4f) — o investimento do Google Ads da etapa Lyrio na
 * MESMA régua da Meta: N dias de calendário de SP terminando hoje
 * (hoje − (N − 1) até hoje). Revoga, só para esta etapa, a D2 da 42.13.
 *
 * ## Por que não mudar a API do Google
 *
 * `services/google-ads.ts` monta a janela como `hoje(UTC) − days` até
 * `hoje(UTC)` — N + 1 dias, em UTC — e está fora do escopo autorizado (PO-07).
 * A rota `GET /api/google-ads/analytics/:accountId/daily?days=&campaignId=` já
 * devolve o gasto por `segments.date`. Pedindo `days = max(N, 28)` por campanha
 * vinculada, a resposta cobre as duas janelas desta tela (o filtro e os 28 dias
 * fixos dos CACs): o recorte dos dias da régua é feito aqui.
 *
 * Por que `days` cobre a janela: o fim da API é o dia de HOJE em UTC, que é o
 * de SP ou o seguinte (SP = UTC − 3); o início é `hoje(UTC) − days`, que é
 * `hoje(SP) − days` ou `hoje(SP) − (days − 1)` — nos dois casos não depois do
 * primeiro dia da régua.
 *
 * ## Risco declarado (não verificado)
 *
 * `segments.date` é o dia no fuso da CONTA do Google Ads. Se a conta não estiver
 * em America/Sao_Paulo, o dia da linha não é o dia de SP — o memorial diz isso.
 * A conferência do fuso da conta é `[FALTA]` não bloqueante da story.
 */

import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import { mensagemDoErroDoGoogle, type ContaDoGoogle, type EstadoDoGoogle } from "./lyrio-google-ads";

/** Uma linha de `/daily` (`GoogleAdsDailyInsight`), só o que a soma usa. */
export interface DiaDoGoogle {
  date: string;
  spend: number;
}

export type InvestimentoDoGoogleNaRegua =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "sem_conta" }
  | { tipo: "sem_campanha" }
  | { tipo: "pronto"; spend: number };

/** Quantos dias pedir à rota `/daily` para cobrir as janelas desta tela. */
export function diasDaConsultaDoGoogle(...janelas: number[]): number {
  return Math.min(365, Math.max(1, ...janelas));
}

/** Soma o gasto das linhas cujo dia está na régua [hoje − (N − 1), hoje]. */
export function somaNaRegua(linhas: readonly DiaDoGoogle[], dias: number, hoje: string): number {
  const inicio = inicioDaJanela(dias, hoje);
  let centavos = 0;
  for (const l of linhas) {
    if (l.date >= inicio && l.date <= hoje) centavos += Math.round((Number(l.spend) || 0) * 100);
  }
  return centavos / 100;
}

/**
 * O investimento das campanhas vinculadas na régua. A conta decide primeiro
 * (sem conta / sem campanha, como na 42.13); depois, QUALQUER consulta em erro
 * torna o total desconhecido — somar só as que responderam daria um número
 * menor, com cara de medido. Carregando enquanto alguma não respondeu.
 */
export function investimentoDoGoogleNaRegua(
  conta: ContaDoGoogle,
  consultas: readonly { isLoading: boolean; error: unknown; data: readonly DiaDoGoogle[] | undefined }[],
  dias: number,
  hoje: string,
): InvestimentoDoGoogleNaRegua {
  if (conta.tipo === "sem_campanha" || conta.tipo === "sem_conta" || conta.tipo === "carregando") return conta;
  if (conta.tipo === "erro") return conta;
  const falha = consultas.find((q) => q.error);
  if (falha) return { tipo: "erro", mensagem: mensagemDoErroDoGoogle(falha.error) };
  if (consultas.length === 0) return { tipo: "pronto", spend: 0 };
  if (consultas.some((q) => q.isLoading || !q.data)) return { tipo: "carregando" };
  let centavos = 0;
  for (const q of consultas) centavos += Math.round(somaNaRegua(q.data!, dias, hoje) * 100);
  return { tipo: "pronto", spend: centavos / 100 };
}

/** O valor conhecido, ou `null` (carregando, erro, sem conta) — nunca "R$ 0" por falta de dado. */
export function valorDoGoogleNaRegua(e: InvestimentoDoGoogleNaRegua): number | null {
  if (e.tipo === "pronto") return e.spend;
  if (e.tipo === "sem_campanha") return 0;
  return null;
}

/**
 * Ponte para o `EstadoDoGoogle` da 42.13, cujo `memorialDoGoogleSemNumero` e
 * `avisoDoGoogle` já dizem a causa de "erro" e "sem conta" — reuso, sem texto novo.
 */
export function comoEstadoDoGoogle(e: InvestimentoDoGoogleNaRegua): EstadoDoGoogle {
  if (e.tipo === "pronto") return { tipo: "sem_entrega" };
  return e;
}

export const NOTA_DO_FUSO_DO_GOOGLE =
  "Dias de calendário de SP (a régua da Meta). O dia de cada linha é o `segments.date` do Google Ads, que segue o fuso da CONTA — não foi conferido se a conta está em America/Sao_Paulo.";
