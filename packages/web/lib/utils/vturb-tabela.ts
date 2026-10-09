// ============================================================
// Story 29.78 — as contas da tabela das VSLs do funil perpétuo.
//
// Pedido do Danilo (23/09): Play Rate e Retenção ao pitch por vídeo, "igual o
// VTurb", com linha de Total. A API entrega só BRUTOS; as taxas nascem aqui,
// num lugar só, porque a linha de Total não tem taxa pronta no VTurb.
//
// ## "Igual o VTurb" (conferido contra os brutos de 5 players, 23/09)
//
//   Play Rate          = started_device_uniq ÷ viewed_device_uniq
//   Retenção ao pitch  = over_pitch ÷ (over_pitch + under_pitch)
//
// e as duas TRUNCADAS a 2 casas: PPS 13/164 = 7,9268 → o VTurb mostra 7,92,
// não 7,93. ⚠️ `over + under` NÃO é "quem deu play" (NETÃO: 4.032 contra
// 3.903 plays únicos). A partir da 29.81 o cartão da Análise MVP também usa
// esta conta (soma dos vídeos, `somaDasVsls`); a CADEIA da 29.36 mantém a base
// encadeada (over ÷ plays únicos) — ver `mvp-vsl-somada.ts`.
//
// ## Truncar com INTEIROS (PO-09)
//
// A conta inteira (`centesimosTruncados`, `textoDePercentual`) mudou para o
// módulo folha `packages/shared/src/percentual-truncado.ts` na Story 29.81
// (PO-07): o feed público da 43.5 passou a precisar dela na API. Continua
// reexportada daqui para os consumidores do web não mudarem de import.
//
// ## Story 29.82 — as colunas completas
//
// Visualizações (`total_viewed`), Vis. Únicas, Plays (`total_started`), Plays
// Únicos, Audiência do Pitch (`total_over_pitch`), Engajamento
// (`engagement_rate`) e Cliques no Botão (`total_clicked`, o NÚMERO — nunca
// taxa). Contagens somam no Total; o Engajamento do Total é a definição do
// dono: Σ assistido ÷ Σ (plays × duração), com assistido = engajamento ×
// plays × duração e plays = `total_started` (resposta do dono ao AC3,
// 2026-10-09). Os campos novos são OPCIONAIS no tipo: a API v36 não os manda,
// e aí as colunas novas mostram "—" (AC6).
// ============================================================

import { shiftDayKey } from "@loyola-x/shared/src/janela-de-dias";
import { centesimosTruncados, textoDePercentual } from "@loyola-x/shared/src/percentual-truncado";

export { centesimosTruncados, textoDePercentual };

/** Os brutos por vídeo, como a API devolve. */
export interface BrutosDaVsl {
  viewedUniq: number;
  startedUniq: number;
  overPitch: number;
  underPitch: number;
  /** Story 29.82 — `total_viewed`. Ausente na API v36. */
  viewed?: number;
  /** Story 29.82 — `total_started`. Ausente na API v36. */
  started?: number;
  /** Story 29.82 — `total_clicked`. Ausente na API v36. */
  clicked?: number;
  /** Story 29.82 — `engagement_rate` do VTurb, em % (16,1 = 16,1 %). Ausente na API v36. */
  engagementRate?: number;
}

/** Uma linha da resposta de `GET …/funnels/:funnelId/vturb/vsls`. */
export interface VslDoFunil {
  playerId: string;
  nome: string;
  /** Pitch ATUAL do VTurb, em segundos; `null` quando não configurado. */
  pitchTime: number | null;
  pitchConfigurado: boolean;
  /**
   * Story 29.82 (PO-01) — a duração (s) que a API mandou ao VTurb. `null` = o
   * vídeo não tem duração na conta (sem Engajamento); ausente = API v36.
   */
  duracao?: number | null;
  /** `null` quando a leitura deste vídeo falhou. */
  brutos: BrutosDaVsl | null;
  erro: string | null;
}

export interface TabelaDeVslsDoFunil {
  funnelId: string;
  range: { startDate: string; endDate: string; timezone: string };
  videos: VslDoFunil[];
}

export const MOTIVO_SEM_DADOS = "sem dados no período";
export const MOTIVO_SEM_PITCH = "pitch não configurado no VTurb";
export const MOTIVO_FALHA = "falha na leitura";
/** Story 29.82 (AC4) — sem `video_duration` o VTurb não calcula o engajamento. */
export const MOTIVO_SEM_DURACAO = "duração do vídeo ausente no VTurb";
/** Story 29.82 (AC6) — a API no ar ainda não manda a coluna. */
export const MOTIVO_API_ANTERIOR = "aguardando atualização da API";

/** Uma célula de taxa: o texto (`"7,92%"`) ou `null` com o motivo — nunca 0 % no lugar de ausência. */
export interface CelulaDeTaxa {
  texto: string | null;
  motivo: string | null;
}

const ausente = (motivo: string): CelulaDeTaxa => ({ texto: null, motivo });

function celula(parte: number, todo: number, motivoDoZero: string): CelulaDeTaxa {
  const c = centesimosTruncados(parte, todo);
  return c === null ? ausente(motivoDoZero) : { texto: textoDePercentual(c), motivo: null };
}

const formatoInteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Story 29.82 (AC5) — contagem com separador de milhar pt-BR: 15128 → `"15.128"`. */
export function textoDeContagem(n: number): string {
  return formatoInteiro.format(n);
}

/** Uma célula de contagem: ausente (API anterior) vira "—" com o motivo, nunca 0. */
function contagem(valor: number | undefined): CelulaDeTaxa {
  return valor === undefined || !Number.isFinite(valor) ? ausente(MOTIVO_API_ANTERIOR) : { texto: textoDeContagem(valor), motivo: null };
}

/**
 * Um número decimal como RACIONAL EXATO `m ÷ 10^k`, a partir da menor
 * representação decimal que o JavaScript dá a ele (`String(x)`): 0,29 → 29/10²,
 * 16,1 → 161/10¹. É o número que o VTurb escreveu (`"16.1"`), sem o ruído
 * binário que `0.29 × 100 = 28,999…` traz. `null` para negativo ou não finito.
 */
function decimalExato(x: number): { m: bigint; k: number } | null {
  if (!Number.isFinite(x) || x < 0) return null;
  const [mantissa = "0", expoente] = String(x).toLowerCase().split("e");
  const [inteiro = "0", fracao = ""] = mantissa.split(".");
  const k = fracao.length - Number(expoente ?? 0);
  const digitos = BigInt(inteiro + fracao);
  return k >= 0 ? { m: digitos, k } : { m: digitos * 10n ** BigInt(-k), k: 0 };
}

/**
 * Story 29.82 (AC5, PO-04) — um percentual DECIMAL (o `engagement_rate` do
 * VTurb, ex.: 16,1) em centésimos truncados, sem ponto flutuante: 0,29 → 29
 * (o piso em float dá 28), 16,1 → 1610, 30,0585 → 3005. `null` quando inválido.
 */
export function centesimosDeDecimal(x: number): number | null {
  const d = decimalExato(x);
  return d === null ? null : Number((d.m * 100n) / 10n ** BigInt(d.k));
}

/** Os campos da 29.82 chegaram? (a API v36 não os manda) */
function temColunasNovas(v: VslDoFunil): v is VslDoFunil & { brutos: Required<BrutosDaVsl>; duracao: number | null } {
  const b = v.brutos;
  return (
    !!b &&
    v.duracao !== undefined &&
    b.viewed !== undefined &&
    b.started !== undefined &&
    b.clicked !== undefined &&
    b.engagementRate !== undefined
  );
}

export interface LinhaDaTabela {
  playerId: string;
  nome: string;
  /** Story 29.82 — `total_viewed`. */
  visualizacoes: CelulaDeTaxa;
  /** Story 29.82 — `total_viewed_device_uniq`. */
  visUnicas: CelulaDeTaxa;
  /** Story 29.82 — `total_started`. */
  plays: CelulaDeTaxa;
  /** Story 29.82 — `total_started_device_uniq`. */
  playsUnicos: CelulaDeTaxa;
  playRate: CelulaDeTaxa;
  retencao: CelulaDeTaxa;
  /** Story 29.82 — `total_over_pitch`, em pessoas; "—" sem pitch. */
  audienciaPitch: CelulaDeTaxa;
  /** Story 29.82 — `engagement_rate`, truncado a 2 casas; "—" sem duração. */
  engajamento: CelulaDeTaxa;
  /** Story 29.82 — `total_clicked`, o número (sem %). */
  cliques: CelulaDeTaxa;
  /** Mensagem da falha deste vídeo, para aparecer NA LINHA dele (AC8). */
  erro: string | null;
}

/** Story 29.78 (AC3/AC4/AC7/AC8) — uma linha por vídeo. */
export function linhaDaTabela(v: VslDoFunil): LinhaDaTabela {
  if (!v.brutos) {
    const falha = ausente(MOTIVO_FALHA);
    return {
      playerId: v.playerId,
      nome: v.nome,
      visualizacoes: falha,
      visUnicas: falha,
      plays: falha,
      playsUnicos: falha,
      playRate: falha,
      retencao: falha,
      audienciaPitch: falha,
      engajamento: falha,
      cliques: falha,
      erro: v.erro ?? MOTIVO_FALHA,
    };
  }
  const b = v.brutos;
  return {
    playerId: v.playerId,
    nome: v.nome,
    visualizacoes: contagem(b.viewed),
    visUnicas: contagem(b.viewedUniq),
    plays: contagem(b.started),
    playsUnicos: contagem(b.startedUniq),
    playRate: celula(b.startedUniq, b.viewedUniq, MOTIVO_SEM_DADOS),
    retencao: v.pitchConfigurado ? celula(b.overPitch, b.overPitch + b.underPitch, MOTIVO_SEM_DADOS) : ausente(MOTIVO_SEM_PITCH),
    audienciaPitch: v.pitchConfigurado ? contagem(b.overPitch) : ausente(MOTIVO_SEM_PITCH),
    engajamento: engajamentoDaLinha(v),
    cliques: contagem(b.clicked),
    erro: null,
  };
}

/** Story 29.82 (AC1/AC4) — o engajamento de UMA linha: o do VTurb, truncado. */
function engajamentoDaLinha(v: VslDoFunil): CelulaDeTaxa {
  if (!temColunasNovas(v)) return ausente(MOTIVO_API_ANTERIOR);
  // Sem duração o VTurb não calcula e a normalização da API escreve 0: não é 0 %.
  if (v.duracao === null) return ausente(MOTIVO_SEM_DURACAO);
  if (v.brutos.started === 0) return ausente(MOTIVO_SEM_DADOS);
  const c = centesimosDeDecimal(v.brutos.engagementRate);
  return c === null ? ausente(MOTIVO_SEM_DADOS) : { texto: textoDePercentual(c), motivo: null };
}

export interface TotalDaTabela {
  visualizacoes: CelulaDeTaxa;
  visUnicas: CelulaDeTaxa;
  plays: CelulaDeTaxa;
  playsUnicos: CelulaDeTaxa;
  playRate: CelulaDeTaxa;
  retencao: CelulaDeTaxa;
  audienciaPitch: CelulaDeTaxa;
  engajamento: CelulaDeTaxa;
  cliques: CelulaDeTaxa;
  /** Story 29.82 (AC4) — vídeos lidos que ficaram fora do Engajamento do Total: sem duração. */
  foraDoEngajamento: string[];
  /** Vídeos que ficaram FORA do Total inteiro — a leitura falhou (AC8). */
  foraPorFalha: string[];
  /** Vídeos que entram no Play Rate e ficam fora da Retenção — sem pitch (AC4). */
  foraDaRetencao: string[];
}

/**
 * Story 29.81 (AC2, PO-07) — o Σ dos brutos da linha de Total, EXTRAÍDO de
 * `totalDaTabela` para a Análise MVP usar a mesma soma em vez de reescrevê-la.
 *
 * - vídeo com a leitura falha: fora de tudo (`foraPorFalha`);
 * - vídeo sem pitch: entra no Play Rate e fica fora da Retenção (`foraDaRetencao`);
 * - `over`/`under` somam só os vídeos com pitch.
 */
export interface SomaDasVsls {
  viewed: number;
  started: number;
  over: number;
  under: number;
  /** Os vídeos que entraram no Σ (a leitura deu certo), na ordem da resposta. */
  lidos: VslDoFunil[];
  foraPorFalha: string[];
  foraDaRetencao: string[];
}

export function somaDasVsls(videos: readonly VslDoFunil[]): SomaDasVsls {
  let viewed = 0;
  let started = 0;
  let over = 0;
  let under = 0;
  const lidos: VslDoFunil[] = [];
  const foraPorFalha: string[] = [];
  const foraDaRetencao: string[] = [];
  for (const v of videos) {
    if (!v.brutos) {
      foraPorFalha.push(v.nome);
      continue;
    }
    lidos.push(v);
    viewed += v.brutos.viewedUniq;
    started += v.brutos.startedUniq;
    if (v.pitchConfigurado) {
      over += v.brutos.overPitch;
      under += v.brutos.underPitch;
    } else {
      foraDaRetencao.push(v.nome);
    }
  }
  return { viewed, started, over, under, lidos, foraPorFalha, foraDaRetencao };
}

/**
 * Story 29.78 (AC2) — a linha de Total, pela SOMA DOS BRUTOS.
 *
 * Nunca média de taxas: um vídeo com 50 views e 80 % de play não pesa o mesmo
 * que um com 5.000 views e 30 %. Um aparelho que viu dois vídeos conta nos
 * dois — a tela declara.
 */
export function totalDaTabela(videos: readonly VslDoFunil[]): TotalDaTabela {
  const { viewed, started, over, under, lidos, foraPorFalha, foraDaRetencao } = somaDasVsls(videos);
  if (lidos.length === 0) {
    // Nenhum vídeo lido: o Total não é "sem dados", é falha — dizer o motivo certo.
    const falha = ausente(MOTIVO_FALHA);
    return {
      visualizacoes: falha,
      visUnicas: falha,
      plays: falha,
      playsUnicos: falha,
      playRate: falha,
      retencao: falha,
      audienciaPitch: falha,
      engajamento: falha,
      cliques: falha,
      foraPorFalha,
      foraDaRetencao,
      foraDoEngajamento: [],
    };
  }
  const semPitchNenhum = lidos.every((v) => !v.pitchConfigurado);
  const novas = lidos.every(temColunasNovas);
  /** Σ de um campo da 29.82 — "—" se algum vídeo lido veio da API anterior. */
  const somaNova = (campo: "viewed" | "started" | "clicked"): CelulaDeTaxa =>
    novas ? contagem(lidos.reduce((acc, v) => acc + (v.brutos?.[campo] ?? 0), 0)) : ausente(MOTIVO_API_ANTERIOR);
  const engajamento = engajamentoDoTotal(lidos);
  return {
    visualizacoes: somaNova("viewed"),
    visUnicas: contagem(viewed),
    plays: somaNova("started"),
    playsUnicos: contagem(started),
    playRate: celula(started, viewed, MOTIVO_SEM_DADOS),
    retencao: semPitchNenhum ? ausente(MOTIVO_SEM_PITCH) : celula(over, over + under, MOTIVO_SEM_DADOS),
    // `over` já soma só os vídeos com pitch (`somaDasVsls`).
    audienciaPitch: semPitchNenhum ? ausente(MOTIVO_SEM_PITCH) : contagem(over),
    engajamento: engajamento.celula,
    cliques: somaNova("clicked"),
    foraPorFalha,
    foraDaRetencao,
    foraDoEngajamento: engajamento.fora,
  };
}

/**
 * Story 29.82 (AC2/AC3/AC4/PO-04) — o Engajamento do Total pela definição do
 * dono: Σ tempo assistido ÷ Σ (plays × duração), com o tempo assistido de cada
 * vídeo = engajamento × plays × duração e plays = `total_started` (o mesmo da
 * coluna Plays — resposta do dono ao AC3). É a média PONDERADA por
 * plays × duração, nunca a média simples das taxas.
 *
 * Vídeo sem duração sai do numerador E do denominador (incluí-lo como 0
 * puxaria o Total para baixo) e vai para `fora`. A conta é em racionais
 * exatos (BigInt) e trunca a 2 casas sem ruído de ponto flutuante.
 */
function engajamentoDoTotal(lidos: readonly VslDoFunil[]): { celula: CelulaDeTaxa; fora: string[] } {
  if (!lidos.every(temColunasNovas)) return { celula: ausente(MOTIVO_API_ANTERIOR), fora: [] };
  const fora: string[] = [];
  const termos: { eng: { m: bigint; k: number }; dur: { m: bigint; k: number }; plays: bigint }[] = [];
  for (const v of lidos) {
    if (!temColunasNovas(v)) continue;
    const dur = v.duracao === null ? null : decimalExato(v.duracao);
    if (dur === null || dur.m === 0n) {
      fora.push(v.nome);
      continue;
    }
    const eng = decimalExato(v.brutos.engagementRate);
    if (eng === null || !Number.isInteger(v.brutos.started) || v.brutos.started < 0) continue;
    termos.push({ eng, dur, plays: BigInt(v.brutos.started) });
  }
  // Escala comum 10^K para somar racionais: eng × plays × dur tem k_eng + k_dur casas.
  const K = termos.reduce((maior, t) => Math.max(maior, t.eng.k + t.dur.k), 0);
  let numerador = 0n;
  let denominador = 0n;
  for (const t of termos) {
    numerador += t.eng.m * t.plays * t.dur.m * 10n ** BigInt(K - t.eng.k - t.dur.k);
    denominador += t.plays * t.dur.m * 10n ** BigInt(K - t.dur.k);
  }
  if (denominador === 0n) {
    const motivo = termos.length === 0 && fora.length > 0 ? MOTIVO_SEM_DURACAO : MOTIVO_SEM_DADOS;
    return { celula: ausente(motivo), fora };
  }
  return { celula: { texto: textoDePercentual(Number((numerador * 100n) / denominador)), motivo: null }, fora };
}

/**
 * Story 29.78 (AC12) — o painel por vídeo tem pitch para medir "Chegaram no
 * pitch"? Sem ele, o cartão mostra "—" com `MOTIVO_SEM_PITCH`, como a tabela.
 *
 * A API nova manda em `player.pitchTime` o pitch ATUAL do VTurb, já `null`
 * quando é 0 ou ausente. A regra aqui também cobre a API antiga, que manda a
 * cópia do vínculo — e a cópia pode ser 0 (498 de 574 players da conta em
 * 23/09): com pitch 0 o VTurb conta todo mundo "acima do pitch" (~100 %).
 */
export function pitchConfiguradoNoPainel(pitchTime: number | null | undefined): pitchTime is number {
  return typeof pitchTime === "number" && Number.isFinite(pitchTime) && pitchTime > 0;
}

/** O que o bloco faz com a leitura da tabela. */
export type EstadoDaTabela = "oculta" | "carregando" | "erro" | "pronta";

/**
 * Story 29.78 (DOC-001 do gate) — o período no cabeçalho da tabela.
 *
 * Com linhas na tela, é a janela DEVOLVIDA pela rota — a enviada ao VTurb, a
 * das linhas. Na troca de período as linhas antigas ficam esmaecidas até as
 * novas chegarem (`placeholderData`), e o cabeçalho acompanha as linhas, não o
 * seletor. A janela pedida só aparece no esqueleto e no erro, quando não há
 * linha para descrever.
 */
export function periodoDoCabecalho(
  estado: Exclude<EstadoDaTabela, "oculta">,
  dados: Pick<TabelaDeVslsDoFunil, "range"> | undefined,
  pedido: { startDate: string; endDate: string },
): { startDate: string; endDate: string } {
  return estado === "pronta" && dados ? { startDate: dados.range.startDate, endDate: dados.range.endDate } : pedido;
}

/**
 * Story 29.78 (AC1/AC8/AC9) — a tabela aparece?
 *
 * - Só no funil PERPÉTUO: o bloco é compartilhado com lançamento e mobile.
 * - 404 = a API no ar ainda não tem a rota (deploys em ciclos diferentes): o
 *   bloco fica como era, sem erro. A rota nova responde 200 com lista vazia
 *   para funil sem vídeo (PO-08), então o 404 não é ambíguo.
 * - Qualquer outra falha aparece como erro — nunca uma tabela vazia calada.
 * - Lista vazia: nenhum vídeo vinculado; o bloco já diz isso.
 */
export function estadoDaTabela(input: {
  ehPerpetuo: boolean;
  carregando: boolean;
  statusDoErro: number | null | undefined;
  temErro: boolean;
  quantidade: number | undefined;
}): EstadoDaTabela {
  if (!input.ehPerpetuo) return "oculta";
  if (input.temErro) return input.statusDoErro === 404 ? "oculta" : "erro";
  if (input.carregando) return "carregando";
  return (input.quantidade ?? 0) > 0 ? "pronta" : "oculta";
}

const FUSO_PADRAO = "America/Sao_Paulo";

/** O dia civil de `instante` no fuso dado (`YYYY-MM-DD`). Fuso inválido cai no de São Paulo. */
export function diaNoFuso(instante: Date, timezone: string | null | undefined): string {
  const formatar = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
  try {
    return formatar(timezone || FUSO_PADRAO);
  } catch {
    return formatar(FUSO_PADRAO);
  }
}

/**
 * Story 29.78 (AC6) — a janela do bloco VSL, no FUSO DA CONEXÃO do VTurb.
 *
 * Antes era `toISOString()` (UTC): entre 21h e meia-noite em São Paulo o
 * "hoje" já era amanhã, e a tela pedia ao VTurb um dia que não começou.
 *
 * A régua do período continua a de sempre — de `hoje − dias` até hoje —, só
 * que com "hoje" no fuso certo. Um seletor, uma janela: tabela e painel do
 * vídeo leem este mesmo intervalo.
 */
export function intervaloDoBloco(
  dias: number,
  timezone: string | null | undefined,
  agora: Date = new Date(),
): { startDate: string; endDate: string } {
  const hoje = diaNoFuso(agora, timezone);
  return { startDate: shiftDayKey(hoje, -dias), endDate: hoje };
}
