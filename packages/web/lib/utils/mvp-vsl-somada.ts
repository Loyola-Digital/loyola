// ============================================================
// Story 29.81 — a Análise MVP lê TODOS os vídeos do funil, "igual o VTurb".
//
// Antes, o cartão "Cadeia da VSL — medida" e os elos de vídeo da cadeia da
// 29.36 vinham da `/chain` (29.41): UM vídeo, escolhido por `.limit(1)` sem
// `orderBy`, com a CÓPIA do pitch gravada no vínculo. Agora vêm da `/vsls` da
// 29.78 (caminho A da story, PO-06): a união sem duplicata dos vídeos das
// etapas, o pitch ATUAL do VTurb e os brutos por vídeo.
//
// Esta função é a montagem inteira "leitura → Σ → cartão + fontes da cadeia",
// fora do componente porque o runner do web não coleta `components/funnels/**`
// (PO-09). O componente só renderiza o que sai daqui — e o teste de leitura de
// fonte (`mvp-vsl-somada-fio.test.ts`) trava que ele use isto.
//
// ## Duas retenções na mesma aba, de propósito (AC1 × AC5)
//
//   cartão  → over ÷ (over + under), truncada — "igual o VTurb" (decisão 1)
//   cadeia  → over ÷ plays únicos — a base ENCADEADA (decisão AC5 = padrão)
//
// A cadeia da 29.36 multiplica as taxas (CAC decomposto, taxa necessária,
// ranking). Ela só telescopa se o numerador de um elo for o denominador do
// seguinte (CHAIN-01): plays únicos → acima do pitch. `over + under` não é
// "plays únicos" (NETÃO: 4.032 × 3.903), e trocar a base ali quebraria o
// produto em +3,3 %. O cartão diz isso na tela (`AVISO_DA_CADEIA`).
//
// ## Σ, nunca média de taxas (AC2)
//
// O Σ é o da linha de Total da 29.78 (`somaDasVsls`, extraído de
// `totalDaTabela`), e a Retenção do cartão É a do Total — os dois números
// da tela não podem divergir no mesmo período.
// ============================================================

import type { TaxaMedida, VturbChain } from "@/lib/hooks/use-vturb";
import type { ChainSourcesVturb } from "./mvp-chain-rates";
import {
  MOTIVO_FALHA,
  MOTIVO_SEM_PITCH,
  somaDasVsls,
  totalDaTabela,
  type CelulaDeTaxa,
  type SomaDasVsls,
  type TabelaDeVslsDoFunil,
  type VslDoFunil,
} from "./vturb-tabela";

/** AC5 — a cadeia abaixo do cartão usa a base encadeada; dizer na tela (R3). */
export const AVISO_DA_CADEIA =
  "A cadeia abaixo usa acima do pitch ÷ plays únicos (base encadeada), para o produto das taxas fechar — por isso a retenção dela difere desta.";

/** AC2 — a dica da soma. */
export const DICA_DA_SOMA =
  "Soma dos vídeos do funil: um aparelho que viu dois vídeos conta nos dois.";

/** AC3 (PO-04) — vídeo com plays e sem pitch: o Σ de "acima do pitch" seria parcial. */
export function motivoFunilMisto(nomes: readonly string[]): string {
  return (
    `funil misto — ${nomes.join(", ")} tem plays no período e está sem pitch no VTurb; ` +
    "um Σ parcial de acima do pitch daria uma taxa viesada com cara de medida"
  );
}

/** AC7 (PO-05) — vídeo que falhou: o Σ sem ele não descreve o funil que a Meta mediu. */
export function motivoFalhaParcial(nomes: readonly string[]): string {
  return `falha na leitura de ${nomes.join(", ")} — o Σ sem esse vídeo não descreve o funil que a Meta mediu`;
}

const MOTIVO_DENOMINADOR_ZERO = "denominador zero — não houve medição na janela";

/** Fração dos brutos com as guardas da cadeia: denominador 0 e > 100 % são ausência, nunca número. */
function taxaDosBrutos(numerador: number, denominador: number, motivoAcimaDe100: string): TaxaMedida {
  if (!(denominador > 0)) return { valor: null, motivo: MOTIVO_DENOMINADOR_ZERO, numerador, denominador: 0 };
  const v = numerador / denominador;
  if (v > 1) return { valor: null, motivo: motivoAcimaDe100, numerador, denominador };
  return { valor: v, numerador, denominador };
}

function pitchLegivel(v: VslDoFunil): string {
  if (!v.pitchConfigurado || v.pitchTime == null) return MOTIVO_SEM_PITCH;
  return `pitch em ${Math.floor(v.pitchTime / 60)}:${String(v.pitchTime % 60).padStart(2, "0")}`;
}

/** Os vídeos que têm plays no período e estão sem pitch (funil misto, AC3). */
function semPitchComPlays(soma: SomaDasVsls): string[] {
  return soma.lidos.filter((v) => !v.pitchConfigurado && (v.brutos?.startedUniq ?? 0) > 0).map((v) => v.nome);
}

/**
 * O `pitch_rate` da CADEIA na base encadeada: Σ over ÷ Σ plays únicos (AC5).
 * Ausente — com o motivo — quando nenhum vídeo tem pitch ou o funil é misto.
 */
function pitchRateEncadeado(soma: SomaDasVsls): TaxaMedida {
  const comPitch = soma.lidos.filter((v) => v.pitchConfigurado);
  if (comPitch.length === 0) {
    return { valor: null, motivo: MOTIVO_SEM_PITCH, numerador: soma.over, denominador: soma.started };
  }
  const misto = semPitchComPlays(soma);
  if (misto.length > 0) {
    return { valor: null, motivo: motivoFunilMisto(misto), numerador: soma.over, denominador: soma.started };
  }
  return taxaDosBrutos(
    soma.over,
    soma.started,
    "acima de 100% — mais aparelhos acima do pitch que plays únicos na soma dos vídeos",
  );
}

/** Por que o `conv_post_pitch` não pode ser medido com este Σ (AC3/AC7), ou `null`. */
function motivoSemConvPostPitch(soma: SomaDasVsls): string | null {
  if (soma.foraPorFalha.length > 0) return motivoFalhaParcial(soma.foraPorFalha);
  if (soma.lidos.every((v) => !v.pitchConfigurado)) return MOTIVO_SEM_PITCH;
  const misto = semPitchComPlays(soma);
  return misto.length > 0 ? motivoFunilMisto(misto) : null;
}

export interface CartaoDaVslSomada {
  /** A janela DEVOLVIDA pela `/vsls` — a enviada ao VTurb (guarda de janela, PO-15). */
  janela: { startDate: string; endDate: string; timezone: string };
  totalDeVideos: number;
  /** Quantos vídeos entraram no Σ (a leitura deu certo). */
  entraram: number;
  /** Σ plays únicos ÷ Σ pageviews — ARREDONDADO na tela, como hoje (decisão do Danilo). */
  playRate: TaxaMedida;
  /** A Retenção da linha de Total da 29.78 (truncada), com o Σ que a produziu. */
  retencao: CelulaDeTaxa & { numerador: number; denominador: number };
  /** O denominador medido do `conv_post_pitch` (Σ over), ou o motivo da ausência. */
  convPostPitch: { denominador: number | null; motivo: string | null };
  /** Fora de tudo — a leitura falhou (AC7). */
  foraPorFalha: { nome: string; erro: string }[];
  /** No Play rate, fora da Retenção — "pitch não configurado no VTurb" (AC3). */
  foraDaRetencao: string[];
  /** GR-01.e — cada vídeo com o pitch ATUAL usado (AC3: nunca a cópia do vínculo). */
  proveniencia: string[];
}

export interface VturbDaMvp {
  /**
   * De onde vieram os números: `vsls` (29.81), `chain` (fallback — API sem a
   * `/vsls`, 404) ou `pendente` (a leitura ainda não voltou).
   */
  origem: "vsls" | "chain" | "pendente";
  cartao: CartaoDaVslSomada | null;
  /** Os brutos e taxas que alimentam `buildMeasuredRates` (a cadeia da 29.36). */
  fontes: ChainSourcesVturb | null;
  /** Por que não há `fontes` quando isso é falha, não ausência de VSL (AC7). */
  motivoSemVturb: string | null;
  /** Falha geral da leitura: aparece como erro no cartão, nunca calado (AC7). */
  erro: string | null;
}

/**
 * A `/vsls` respondeu 404? Então a API no ar ainda não tem a rota (deploys em
 * ciclos diferentes, AC9) e a MVP volta à `/chain`, como era. Qualquer outro
 * erro é falha de verdade e aparece como erro. A `/chain` só é pedida NESTE
 * caso — pedir as duas dobraria a cota do VTurb (Dev Notes).
 */
export function leituraDaChainNecessaria(erroDaVsls: unknown): boolean {
  return (erroDaVsls as { status?: number } | null | undefined)?.status === 404;
}

/** Os brutos da `/chain` (29.41), como a MVP os usava — só no fallback. */
export function fontesDaChain(chain: VturbChain): ChainSourcesVturb {
  return {
    playerName: chain.player.name,
    playerId: chain.player.playerId,
    viewedUniq: chain.brutos.viewedUniq,
    startedUniq: chain.brutos.startedUniq,
    overPitch: chain.brutos.overPitch,
    playRate: chain.cadeia.playRate,
    pitchRate: chain.cadeia.pitchRate,
  };
}

/** Story 29.81 (AC1–AC4, AC7) — o cartão e as fontes da cadeia a partir da `/vsls`. */
export function cadeiaDaVslSomada(tabela: TabelaDeVslsDoFunil): {
  cartao: CartaoDaVslSomada;
  fontes: ChainSourcesVturb | null;
  motivoSemVturb: string | null;
} {
  const soma = somaDasVsls(tabela.videos);
  const total = totalDaTabela(tabela.videos);
  const playRate = taxaDosBrutos(
    soma.started,
    soma.viewed,
    "acima de 100% — mais plays únicos que pageviews na soma dos vídeos",
  );
  const semConv = motivoSemConvPostPitch(soma);

  const cartao: CartaoDaVslSomada = {
    janela: tabela.range,
    totalDeVideos: tabela.videos.length,
    entraram: soma.lidos.length,
    playRate: soma.lidos.length === 0 ? { valor: null, motivo: MOTIVO_FALHA, numerador: 0, denominador: 0 } : playRate,
    retencao: { ...total.retencao, numerador: soma.over, denominador: soma.over + soma.under },
    convPostPitch: semConv ? { denominador: null, motivo: semConv } : { denominador: soma.over, motivo: null },
    foraPorFalha: tabela.videos
      .filter((v) => !v.brutos)
      .map((v) => ({ nome: v.nome, erro: v.erro ?? MOTIVO_FALHA })),
    foraDaRetencao: total.foraDaRetencao,
    proveniencia: tabela.videos.map((v) => `${v.nome} (${v.playerId}) · ${v.brutos ? pitchLegivel(v) : MOTIVO_FALHA}`),
  };

  if (soma.lidos.length === 0) {
    // Nenhum vídeo lido: a cadeia não recebe um Σ de zeros com cara de medida.
    return { cartao, fontes: null, motivoSemVturb: `${MOTIVO_FALHA} de todos os vídeos do funil no VTurb` };
  }

  const fontes: ChainSourcesVturb = {
    fonte:
      `soma de ${soma.lidos.length} ${soma.lidos.length === 1 ? "vídeo" : "vídeos"}: ` +
      soma.lidos.map((v) => `${v.nome} (${v.playerId})`).join(", "),
    viewedUniq: soma.viewed,
    startedUniq: soma.started,
    overPitch: soma.over,
    playRate,
    pitchRate: pitchRateEncadeado(soma),
    motivoSemConnect: soma.foraPorFalha.length > 0 ? motivoFalhaParcial(soma.foraPorFalha) : null,
    motivoSemConvPostPitch: semConv,
  };
  return { cartao, fontes, motivoSemVturb: null };
}

/**
 * Story 29.81 — a leitura da MVP numa janela: a `/vsls` quando a API a tem, a
 * `/chain` só quando ela responde 404.
 *
 * Com a `/vsls` disponível, os brutos da `/chain` são IGNORADOS mesmo que
 * existam (cache antigo): o cartão e a cadeia leem o Σ, nunca um vídeo só.
 */
export function montarVturbDaMvp(input: {
  vsls: TabelaDeVslsDoFunil | undefined;
  erroVsls: unknown;
  chain: VturbChain | undefined;
}): VturbDaMvp {
  if (leituraDaChainNecessaria(input.erroVsls)) {
    return {
      origem: "chain",
      cartao: null,
      fontes: input.chain ? fontesDaChain(input.chain) : null,
      motivoSemVturb: null,
      erro: null,
    };
  }
  if (input.erroVsls) {
    const msg = (input.erroVsls as Error)?.message || "erro desconhecido";
    return {
      origem: "vsls",
      cartao: null,
      fontes: null,
      motivoSemVturb: `${MOTIVO_FALHA} do VTurb: ${msg}`,
      erro: msg,
    };
  }
  if (!input.vsls) return { origem: "pendente", cartao: null, fontes: null, motivoSemVturb: null, erro: null };
  // Funil sem vídeo: a `/vsls` responde 200 com lista vazia — é o "sem VSL
  // vinculada" de sempre, não falha.
  if (input.vsls.videos.length === 0) {
    return { origem: "vsls", cartao: null, fontes: null, motivoSemVturb: null, erro: null };
  }
  const { cartao, fontes, motivoSemVturb } = cadeiaDaVslSomada(input.vsls);
  return { origem: "vsls", cartao, fontes, motivoSemVturb, erro: null };
}
