/**
 * Story 49.18 — mídia por anúncio no Debriefing (passos 3–5 do método
 * `leitura-parcial-lancamento.md`): ranking por NOME de anúncio, estático ×
 * vídeo, público com o ADV+ separado do frio, peças de escassez lidas por dia
 * de veiculação e a copy igual.
 *
 * **Puro.** O Motor II (`computeDebriefingAudience`) prepara a entrada — linhas
 * anúncio × dia do ad-level das campanhas de captação, com o investimento já
 * com o imposto do Loyola (R11-0c), e os compradores de captação com o ad_id
 * do `utm_content` da linha de ingresso/combo (`co=`) — e recebe a saída em
 * `publico.midiaPorAnuncio`. Sem banco, relógio nem Meta: a mesma entrada dá o
 * mesmo JSON.
 *
 * Regras (story 49.18):
 * - utm_content = Ad ID; um nome de anúncio reúne N ad_ids e as métricas SOMAM
 *   (AC1). O nome é o do cache (`nomesDeAnuncio`) e, sem ele, o da linha; o
 *   agrupamento usa `normalizarNomeCampanha` (sem acento, minúsculo, sem o
 *   sufixo de cópia), o mesmo do Criativo × Faixa;
 * - compra a cada visita = compradores ÷ `landing_page_view` (lido de
 *   `actions`); sem `landing_page_view` no período → `null` com motivo, nunca 0;
 * - formato pelo nome da CAMPANHA (`--videos` / `--estaticos`), independente da
 *   dimensão de criativo da config (AC3); sem formato → "não identificado";
 * - público pelo nome da campanha, com `cold-adv` separado DENTRO do frio (AC4) —
 *   só aqui: o classificador compartilhado e a Tabela 1 não mudam;
 * - peças de escassez SÓ pelo nome do anúncio (R11-5, `TERMOS_DE_ESCASSEZ`):
 *   saem do ranking e são lidas por dia de veiculação (AC5);
 * - copy igual pelo `title` + `body` do cache (AC6); sem texto = "texto indisponível";
 * - CTR/CPC não aparecem; a conversão do clique usa `link_click` (nunca cliques totais).
 *
 * AC2 (R12-3, dono: "menor cpa com maior roas, mínimo de 5% do valor total
 * investido" + "ROAS desempata e captação do lançamento"): cada nome lista as
 * versões isoladas (Ad ID + conjunto) e a composição do payload escolhe a melhor
 * (`comMelhorVersao`), porque a base dos 5% é o investimento de captação do
 * Motor I. Antes da R12-3 o AC2 esperava a P-22,
 * sem resposta do dono.
 *
 * Unidades: `pctDaVerba`, `compraPorVisita` e `conversaoDoClique` em
 * PERCENTUAL (0–100); `tierSuperior` e `parcelaSoIngresso` em FRAÇÃO (0–1),
 * como `comTierSuperior` da 49.3; dinheiro em reais.
 */

import { normalizarNomeCampanha } from "@loyola-x/shared";
import { classificarPublico } from "./launch-report-normalize.js";
import { postDoGrupo } from "../utils/post-do-criativo.js";
import { ehFrioAdv, fmtNumero, fmtReais, type Metrica } from "./debriefing-money-time-engine.js";

// ---------------------------------------------------------------------------
// Constantes (testadas)
// ---------------------------------------------------------------------------

/**
 * R11-5 ("só no nome do anuncio") — os termos do método (passo 5) que marcam
 * uma peça de escassez, mais "falta" no singular (R12-5, P-24: a peça
 * `--falta-1-dia` do PG05). Cada termo casa como palavra inteira: "faltam" e
 * "falta" são dois termos. A comparação ignora maiúsculas, acentos e o separador
 * entre as palavras (`ultimo-dia`, `ultimo_dia`, `último dia`): os nomes reais
 * usam hífen (PG05: `--lote-promo--ultimo-dia`).
 */
export const TERMOS_DE_ESCASSEZ = ["faltam", "falta", "último dia", "últimas horas"] as const;

/** O texto comparável: sem acento, minúsculo, hífen/underline/ponto/barra viram espaço. */
export function normalizarParaEscassez(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-_.|/]+/g, " ")
    .trim();
}

const TERMOS_NORMALIZADOS = TERMOS_DE_ESCASSEZ.map(normalizarParaEscassez);

/** O nome do anúncio contém um dos `TERMOS_DE_ESCASSEZ` (como palavra inteira). */
export function ehPecaDeEscassez(nomeDoAnuncio: string | null | undefined): boolean {
  const n = ` ${normalizarParaEscassez(nomeDoAnuncio)} `;
  return TERMOS_NORMALIZADOS.some((t) => n.includes(` ${t} `));
}

export type FormatoDoAnuncio = "video" | "estatico" | "nao-identificado";
export const FORMATOS_DO_ANUNCIO: readonly FormatoDoAnuncio[] = ["video", "estatico", "nao-identificado"];

/**
 * O formato pelo nome da campanha: o PADRÃO de `tipoPelaCampanha` (Motor II),
 * sem a condição da dimensão de criativo (AC3). Os dois sufixos (ou nenhum) → `null`.
 */
export function formatoPeloNomeDaCampanha(campaignName: string | null | undefined): "video" | "estatico" | null {
  if (!campaignName) return null;
  const n = campaignName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const video = /--videos?(-|$)/.test(n);
  const estatico = /--estaticos?(-|$)/.test(n);
  if (video === estatico) return null;
  return video ? "video" : "estatico";
}

export type PublicoDaMidia = "Quente" | "Frio" | "Frio ADV+" | "Indefinido";
export const PUBLICOS_DA_MIDIA: readonly PublicoDaMidia[] = ["Quente", "Frio", "Frio ADV+", "Indefinido"];

/**
 * Público pelo nome da campanha: a MESMA regra do Quente × Frio do Motor I
 * (`classificarPublico`), e `cold-adv` separado dentro do frio (AC4).
 */
export function publicoDaCampanha(campaignName: string | null | undefined): PublicoDaMidia {
  // 49.20: a regra do ADV+ mora em `ehFrioAdv` (Motor I), a mesma da recompra por origem.
  return ehFrioAdv(campaignName) ? "Frio ADV+" : classificarPublico(campaignName);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Uma linha anúncio × dia do ad-level das campanhas de captação, já com o imposto. */
export interface AnuncioDiaDaMidia {
  adId: string;
  /** Nome resolvido (cache do banco > linha). `null` = sem nome. */
  nome: string | null;
  campaignName: string | null;
  dia: string;
  investimentoComImposto: number;
  /** `null` = a Meta não devolveu `link_click` (≠ 0). */
  linkClicks: number | null;
  /** `null` = a Meta não devolveu `landing_page_view` (≠ 0). Ausente no tipo = loader anterior. */
  landingPageViews: number | null;
  /** AC2 — conjunto (adset) da linha; `null`/ausente = não lido. */
  conjuntoId?: string | null;
  conjuntoNome?: string | null;
}

/** Um comprador de captação (pessoa), com o ad_id da linha de ingresso/combo. */
export interface CompradorDaMidia {
  /** Ad ID do `utm_content` da linha de ingresso/combo; `null` = sem ad_id. */
  adId: string | null;
  /** Faturamento da captação da pessoa (ingresso + combo + order bump, s/ TMB). `null` = a venda não trouxe o valor. */
  faturamento: number | null;
  /** Levou combo ou order bump (tier superior da 49.3). */
  tierSuperior: boolean;
  /** Dia da compra (BRT) da linha de ingresso/combo; `null` = sem data legível. */
  dia: string | null;
}

export interface TextoDoAnuncio {
  title: string | null;
  body: string | null;
}

export interface EntradaDaMidiaPorAnuncio {
  anuncios: readonly AnuncioDiaDaMidia[];
  compradores: readonly CompradorDaMidia[];
  /** As planilhas de venda trazem `utm_content` (senão a atribuição não é medida). */
  vendasComConteudo: boolean;
  postsDosAnuncios: Readonly<Record<string, string>>;
  /** Texto do criativo por ad_id (cache). Ausente = não lido (entrada anterior à 49.18). */
  textosDosAnuncios?: Readonly<Record<string, TextoDoAnuncio>>;
  /** Link do Ads Manager de um ad_id (`linkDoAdsManager` do Motor II, com a conta do funil). */
  linkAdsManagerDe: (adId: string) => string | null;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

/** As métricas comuns a uma linha de ranking, formato, público ou total. */
export interface MetricasDaMidia {
  investimentoComImposto: number;
  /** Investimento ÷ investimento de captação do ad-level × 100. */
  pctDaVerba: Metrica;
  compradores: number;
  /** `null` = alguma venda sem valor (ROAS não medido). */
  faturamento: number | null;
  cpa: Metrica;
  roas: Metrica;
  /** Fração dos compradores com combo ou order bump. */
  tierSuperior: Metrica;
  linkClicks: number | null;
  /** Compradores ÷ link_click × 100. */
  conversaoDoClique: Metrica;
  landingPageViews: number | null;
  /** Compradores ÷ landing_page_view × 100. */
  compraPorVisita: Metrica;
}

export interface LinhaDoRanking extends MetricasDaMidia {
  nome: string;
  /** O nome não foi resolvido: a linha é o próprio ad_id. */
  nomeNaoResolvido: boolean;
  adIds: string[];
  /** O ad_id de maior investimento do nome (o do link do Ads Manager). */
  adIdPrincipal: string;
  publicos: PublicoDaMidia[];
  formatos: FormatoDoAnuncio[];
  /** Post do ad_id de maior investimento entre os que têm post (`postDoGrupo`, 18.88). */
  linkDoPost: string | null;
  linkAdsManager: string | null;
  /** AC2 — as versões isoladas (Ad ID + conjunto) do nome, com os mesmos números, na ordem do Ad ID. */
  versoes: VersaoIsolada[];
  /** AC2 (R12-3) — preenchida na composição do payload (`comMelhorVersao`). Ausente = ainda não escolhida. */
  melhorVersao?: MelhorVersao;
}

/** AC2 — uma versão isolada: um Ad ID (no conjunto da linha mais recente dele). */
export interface VersaoIsolada extends MetricasDaMidia {
  adId: string;
  conjuntoId: string | null;
  conjuntoNome: string | null;
  linkDoPost: string | null;
  linkAdsManager: string | null;
}

export type MotivoSemMelhorVersao = "SEM_VERSAO_ELEGIVEL" | "SEM_COMPRADOR_NAS_ELEGIVEIS" | "SEM_INVESTIMENTO_DE_CAPTACAO";

export interface MelhorVersao {
  /** `null` = nenhuma versão elegível com comprador (o documento diz por quê). */
  versao: VersaoIsolada | null;
  motivo?: MotivoSemMelhorVersao;
  /** Versões com investimento ≥ o mínimo. */
  elegiveis: number;
  memoria: string;
}

/** R12-3 — o mínimo de investimento de uma versão, em fração do investimento de captação do lançamento. */
export const LIMIAR_DA_MELHOR_VERSAO = 0.05;

export interface LinhaDoFormato extends MetricasDaMidia {
  formato: FormatoDoAnuncio;
  anuncios: number;
}

export interface LinhaDoPublico extends MetricasDaMidia {
  publico: PublicoDaMidia;
  anuncios: number;
}

export interface DiaDeEscassez {
  dia: string;
  /** Nomes das peças de escassez com linha no ad-level nesse dia. */
  anunciosNoAr: string[];
  investimentoComImposto: number;
  /** Compradores atribuídos a uma peça de escassez que compraram nesse dia. */
  compradores: number;
  /** Desses, os que levaram só o ingresso (sem combo nem order bump). */
  soIngresso: number;
  parcelaSoIngresso: Metrica;
}

export type VereditoDaCopy = "so-imagem" | "copies-diferentes" | "um-anuncio-com-texto" | "sem-texto" | "nao-lido";

export interface CopyDosAnuncios {
  /** Ad IDs de captação do período. */
  anuncios: number;
  comTexto: number;
  textoIndisponivel: number;
  /** Pares (title, body) distintos entre os que têm texto. */
  copiesDistintas: number;
  veredito: VereditoDaCopy;
  texto: string;
}

export interface MidiaPorAnuncio {
  aplicavel: boolean;
  motivo?: "SEM_AD_LEVEL";
  /** As vendas trazem `utm_content`: sem ele, nenhum comprador é atribuído e as métricas por comprador são `null`. */
  vendasComConteudo: boolean;
  /** Σ investimento c/ imposto do ad-level de captação — o denominador do % da verba. */
  investimentoTotal: number;
  linhasDoAdLevel: number;
  /** Ranking por nome de anúncio, SEM as peças de escassez, por investimento (desc). */
  ranking: LinhaDoRanking[];
  totalDoRanking: MetricasDaMidia;
  /** De onde vem cada comprador de captação (a soma fecha o total). */
  atribuicao: {
    compradores: number;
    noRanking: number;
    naEscassez: number;
    /** Ad ID na venda que não está no ad-level das campanhas de captação no período. */
    adIdForaDoAdLevel: number;
    semAdId: number;
    memoria: string;
  };
  formatos: LinhaDoFormato[];
  publicos: LinhaDoPublico[];
  escassez: {
    termos: string[];
    anuncios: { nome: string; adIds: string[] }[];
    porDia: DiaDeEscassez[];
    /** Compradores das peças sem data de compra legível. */
    compradoresSemData: number;
    total: MetricasDaMidia & { soIngresso: number; parcelaSoIngresso: Metrica };
  };
  copy: CopyDosAnuncios;
  /**
   * AC2 (R12-3) — a base e o mínimo usados na escolha da melhor versão
   * (preenchido com `melhorVersao` de cada linha, na composição do payload).
   */
  criterioDaMelhorVersao?: { limiar: number; investimentoDeCaptacao: number; minimo: number; memoria: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtInt(v: number): string {
  return fmtNumero(v, 0);
}

function nula(motivo: string, memoria: string): Metrica {
  return { valor: null, motivo, memoria };
}

function porOrdem(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Soma das linhas com valor; nenhuma com valor → `null` (a regra de `somarLinkClicks`). */
function somarPresentes(valores: readonly (number | null)[]): number | null {
  const com = valores.filter((v): v is number => v !== null);
  return com.length === 0 ? null : com.reduce((s, v) => s + v, 0);
}

export interface Acumulado {
  linhas: AnuncioDiaDaMidia[];
  compradores: CompradorDaMidia[];
}

/**
 * As métricas de um conjunto de linhas anúncio × dia e dos compradores dos Ad IDs delas.
 * Story 49.19: exportada para o teste de LP, que passa o investimento do PAR como
 * denominador do `pctDaVerba` e o rótulo dele em `rotuloDoTotal` (o padrão é o da 49.18).
 */
export function metricasDe(
  a: Acumulado,
  rotulo: string,
  investimentoTotal: number,
  vendasComConteudo: boolean,
  rotuloDoTotal = "investimento de captação do ad-level",
): MetricasDaMidia {
  const inv = a.linhas.reduce((s, l) => s + l.investimentoComImposto, 0);
  const n = a.compradores.length;
  const semValor = a.compradores.some((c) => c.faturamento === null);
  const fat = semValor ? null : a.compradores.reduce((s, c) => s + (c.faturamento ?? 0), 0);
  const tier = a.compradores.filter((c) => c.tierSuperior).length;
  const linkClicks = somarPresentes(a.linhas.map((l) => l.linkClicks));
  const lpv = somarPresentes(a.linhas.map((l) => l.landingPageViews));
  const semLpv = a.linhas.filter((l) => l.landingPageViews === null).length;
  const semCliques = a.linhas.filter((l) => l.linkClicks === null).length;
  // O numerador acompanha o denominador: só os compradores de Ad IDs que têm a
  // medida em alguma linha (anúncio sem landing_page_view não infla a taxa dos outros).
  const idsCom = (temMedida: (l: AnuncioDiaDaMidia) => boolean) => new Set(a.linhas.filter(temMedida).map((l) => l.adId));
  const comLpv = idsCom((l) => l.landingPageViews !== null);
  const comClique = idsCom((l) => l.linkClicks !== null);
  const nLpv = a.compradores.filter((c) => c.adId !== null && comLpv.has(c.adId)).length;
  const nClique = a.compradores.filter((c) => c.adId !== null && comClique.has(c.adId)).length;
  const foraDaTaxa = (k: number, medida: string) =>
    k < n ? ` — ${fmtInt(n - k)} comprador(es) de anúncio sem ${medida} fora do numerador` : "";
  const semConteudo = nula("SEM_UTM_CONTENT_NA_VENDA", "as planilhas de venda não trazem utm_content — compradores por anúncio não medidos");

  const pctDaVerba: Metrica =
    investimentoTotal > 0
      ? {
          valor: (inv / investimentoTotal) * 100,
          memoria: `investimento c/ imposto (${rotulo}) ${fmtReais(inv)} ÷ ${rotuloDoTotal} ${fmtReais(investimentoTotal)} × 100 = ${fmtNumero((inv / investimentoTotal) * 100, 2)}%`,
        }
      : nula("SEM_INVESTIMENTO", "sem investimento de captação no ad-level — sem denominador");

  let cpa: Metrica;
  let roas: Metrica;
  let tierSuperior: Metrica;
  let conversaoDoClique: Metrica;
  let compraPorVisita: Metrica;
  if (!vendasComConteudo) {
    cpa = roas = tierSuperior = conversaoDoClique = compraPorVisita = semConteudo;
  } else {
    cpa =
      n > 0
        ? { valor: inv / n, memoria: `investimento c/ imposto (${rotulo}) ${fmtReais(inv)} ÷ compradores ${fmtInt(n)} = ${fmtReais(inv / n)}` }
        : nula("SEM_COMPRADOR", `nenhum comprador de captação atribuído (${rotulo}) — CPA sem denominador`);
    roas =
      fat === null
        ? nula("SEM_VALOR_DA_VENDA", `venda sem valor na entrada (${rotulo}) — ROAS não medido`)
        : inv > 0
          ? { valor: fat / inv, memoria: `faturamento da captação dos compradores (${rotulo}) ${fmtReais(fat)} ÷ investimento c/ imposto ${fmtReais(inv)} = ${fmtNumero(fat / inv, 2)}` }
          : nula("SEM_INVESTIMENTO", `sem investimento (${rotulo}) — ROAS sem denominador`);
    tierSuperior =
      n > 0
        ? { valor: tier / n, memoria: `compradores com combo ou order bump ${fmtInt(tier)} ÷ compradores ${fmtInt(n)} (${rotulo}) = ${fmtNumero((tier / n) * 100, 2)}%` }
        : nula("SEM_COMPRADOR", `nenhum comprador de captação atribuído (${rotulo})`);
    conversaoDoClique =
      linkClicks === null
        ? nula("LINK_CLICK_AUSENTE", `a Meta não devolveu link_click (${rotulo}) — conversão do clique não medida (nunca cliques totais)`)
        : linkClicks === 0
          ? nula("SEM_CLIQUES", `zero link_click (${rotulo}) — sem denominador`)
          : {
              valor: (nClique / linkClicks) * 100,
              memoria:
                `compradores ${fmtInt(nClique)} ÷ link_click ${fmtInt(linkClicks)} (${rotulo}) × 100 = ${fmtNumero((nClique / linkClicks) * 100, 2)}%` +
                (semCliques > 0 ? ` — ${fmtInt(semCliques)} linha(s) anúncio×dia sem link_click fora do denominador` : "") +
                foraDaTaxa(nClique, "link_click"),
            };
    compraPorVisita =
      lpv === null
        ? nula("LANDING_PAGE_VIEW_AUSENTE", `a Meta não devolveu landing_page_view no período (${rotulo}) — compra a cada visita não medida (nunca 0)`)
        : lpv === 0
          ? nula("SEM_VISITAS", `zero landing_page_view (${rotulo}) — sem denominador`)
          : {
              valor: (nLpv / lpv) * 100,
              memoria:
                `compradores ${fmtInt(nLpv)} ÷ landing_page_view ${fmtInt(lpv)} (${rotulo}) × 100 = ${fmtNumero((nLpv / lpv) * 100, 2)}%` +
                (semLpv > 0 ? ` — ${fmtInt(semLpv)} linha(s) anúncio×dia sem landing_page_view fora do denominador` : "") +
                foraDaTaxa(nLpv, "landing_page_view"),
            };
  }
  return {
    investimentoComImposto: inv,
    pctDaVerba,
    compradores: n,
    faturamento: fat,
    cpa,
    roas,
    tierSuperior,
    linkClicks,
    conversaoDoClique,
    landingPageViews: lpv,
    compraPorVisita,
  };
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export function computeMidiaPorAnuncio(input: EntradaDaMidiaPorAnuncio): MidiaPorAnuncio {
  const { anuncios, vendasComConteudo } = input;
  const investimentoTotal = anuncios.reduce((s, a) => s + a.investimentoComImposto, 0);

  // Ad ID → nome (o da linha mais recente com nome) e campanha (a da linha mais recente).
  const ultimaPorAdId = new Map<string, AnuncioDiaDaMidia>();
  const nomePorAdId = new Map<string, string>();
  const ordenadas = [...anuncios].sort((a, b) => porOrdem(a.adId, b.adId) || porOrdem(a.dia, b.dia));
  for (const a of ordenadas) {
    ultimaPorAdId.set(a.adId, a);
    const nome = (a.nome ?? "").trim();
    if (nome) nomePorAdId.set(a.adId, nome);
  }
  const ehEscassez = (adId: string) => ehPecaDeEscassez(nomePorAdId.get(adId) ?? null);

  // Compradores por ad_id e a conta da atribuição.
  const compradoresPorAdId = new Map<string, CompradorDaMidia[]>();
  let semAdId = 0;
  let foraDoAdLevel = 0;
  for (const c of input.compradores) {
    if (!c.adId) {
      semAdId += 1;
      continue;
    }
    if (!ultimaPorAdId.has(c.adId)) {
      foraDoAdLevel += 1;
      continue;
    }
    const l = compradoresPorAdId.get(c.adId) ?? [];
    l.push(c);
    compradoresPorAdId.set(c.adId, l);
  }

  const acumular = (adIds: Iterable<string>, filtroDeLinha: (a: AnuncioDiaDaMidia) => boolean = () => true): Acumulado => {
    const ids = new Set(adIds);
    return {
      linhas: anuncios.filter((a) => ids.has(a.adId) && filtroDeLinha(a)),
      compradores: [...ids].flatMap((id) => compradoresPorAdId.get(id) ?? []),
    };
  };

  // ---- Ranking por nome (sem escassez) ----
  const grupos = new Map<string, { nome: string; nomeNaoResolvido: boolean; adIds: Set<string> }>();
  const escassezGrupos = new Map<string, { nome: string; adIds: Set<string> }>();
  for (const adId of [...ultimaPorAdId.keys()].sort(porOrdem)) {
    const nome = nomePorAdId.get(adId) ?? null;
    const normal = nome ? normalizarNomeCampanha(nome) : "";
    const chave = normal ? `n:${normal}` : `id:${adId}`;
    if (ehEscassez(adId)) {
      const g = escassezGrupos.get(chave) ?? { nome: nome!, adIds: new Set<string>() };
      g.adIds.add(adId);
      escassezGrupos.set(chave, g);
      continue;
    }
    const g = grupos.get(chave) ?? { nome: nome ?? adId, nomeNaoResolvido: !nome, adIds: new Set<string>() };
    g.adIds.add(adId);
    grupos.set(chave, g);
  }

  const spendPorAdId = new Map<string, number>();
  for (const a of anuncios) spendPorAdId.set(a.adId, (spendPorAdId.get(a.adId) ?? 0) + a.investimentoComImposto);
  const postPorAdId = new Map(Object.entries(input.postsDosAnuncios));

  const ranking: LinhaDoRanking[] = [...grupos.values()].map((g) => {
    const adIds = [...g.adIds].sort(porOrdem);
    const porSpend = [...adIds].sort((a, b) => (spendPorAdId.get(b) ?? 0) - (spendPorAdId.get(a) ?? 0) || porOrdem(a, b));
    const acc = acumular(adIds);
    const publicos = PUBLICOS_DA_MIDIA.filter((p) => acc.linhas.some((l) => publicoDaCampanha(l.campaignName) === p));
    const formatos = FORMATOS_DO_ANUNCIO.filter((f) => acc.linhas.some((l) => (formatoPeloNomeDaCampanha(l.campaignName) ?? "nao-identificado") === f));
    return {
      nome: g.nome,
      nomeNaoResolvido: g.nomeNaoResolvido,
      adIds,
      adIdPrincipal: porSpend[0]!,
      publicos,
      formatos,
      ...metricasDe(acc, `"${g.nome}"`, investimentoTotal, vendasComConteudo),
      linkDoPost: postDoGrupo(porSpend, spendPorAdId, postPorAdId),
      linkAdsManager: input.linkAdsManagerDe(porSpend[0]!),
      versoes: adIds.map((adId) => {
        const ultima = ultimaPorAdId.get(adId)!;
        return {
          adId,
          conjuntoId: ultima.conjuntoId ?? null,
          conjuntoNome: (ultima.conjuntoNome ?? "").trim() || null,
          ...metricasDe(acumular([adId]), `Ad ID ${adId}`, investimentoTotal, vendasComConteudo),
          linkDoPost: postPorAdId.get(adId) ?? null,
          linkAdsManager: input.linkAdsManagerDe(adId),
        };
      }),
    };
  });
  ranking.sort((a, b) => b.investimentoComImposto - a.investimentoComImposto || porOrdem(a.nome, b.nome) || porOrdem(a.adIdPrincipal, b.adIdPrincipal));
  const idsDoRanking = ranking.flatMap((r) => r.adIds);
  const totalDoRanking = metricasDe(acumular(idsDoRanking), "ranking, sem escassez", investimentoTotal, vendasComConteudo);

  // ---- Formato e público: por linha (investimento) e pelo ad_id (compradores, campanha mais recente) ----
  const formatoDoAdId = (adId: string): FormatoDoAnuncio => formatoPeloNomeDaCampanha(ultimaPorAdId.get(adId)!.campaignName) ?? "nao-identificado";
  const publicoDoAdId = (adId: string): PublicoDaMidia => publicoDaCampanha(ultimaPorAdId.get(adId)!.campaignName);
  const todosOsAdIds = [...ultimaPorAdId.keys()];
  const formatos: LinhaDoFormato[] = FORMATOS_DO_ANUNCIO.map((formato) => {
    const linhas = anuncios.filter((a) => (formatoPeloNomeDaCampanha(a.campaignName) ?? "nao-identificado") === formato);
    const ids = todosOsAdIds.filter((id) => formatoDoAdId(id) === formato);
    const acc = { linhas, compradores: ids.flatMap((id) => compradoresPorAdId.get(id) ?? []) };
    return { formato, anuncios: new Set(linhas.map((l) => l.adId)).size, ...metricasDe(acc, `formato ${formato}`, investimentoTotal, vendasComConteudo) };
  });
  const publicos: LinhaDoPublico[] = PUBLICOS_DA_MIDIA.map((publico) => {
    const linhas = anuncios.filter((a) => publicoDaCampanha(a.campaignName) === publico);
    const ids = todosOsAdIds.filter((id) => publicoDoAdId(id) === publico);
    const acc = { linhas, compradores: ids.flatMap((id) => compradoresPorAdId.get(id) ?? []) };
    return { publico, anuncios: new Set(linhas.map((l) => l.adId)).size, ...metricasDe(acc, `público ${publico}`, investimentoTotal, vendasComConteudo) };
  });

  // ---- Escassez por dia de veiculação ----
  const escassezAnuncios = [...escassezGrupos.values()]
    .map((g) => ({ nome: g.nome, adIds: [...g.adIds].sort(porOrdem) }))
    .sort((a, b) => porOrdem(a.nome, b.nome));
  const idsDeEscassez = new Set(escassezAnuncios.flatMap((g) => g.adIds));
  const linhasEsc = anuncios.filter((a) => idsDeEscassez.has(a.adId));
  const compradoresEsc = [...idsDeEscassez].flatMap((id) => compradoresPorAdId.get(id) ?? []);
  const dias = [...new Set([...linhasEsc.map((l) => l.dia), ...compradoresEsc.flatMap((c) => (c.dia ? [c.dia] : []))])].sort(porOrdem);
  const parcela = (so: number, n: number, rotulo: string): Metrica =>
    !vendasComConteudo
      ? nula("SEM_UTM_CONTENT_NA_VENDA", "as planilhas de venda não trazem utm_content — compradores por anúncio não medidos")
      : n > 0
        ? { valor: so / n, memoria: `compradores só de ingresso ${fmtInt(so)} ÷ compradores ${fmtInt(n)} (${rotulo}) = ${fmtNumero((so / n) * 100, 2)}%` }
        : nula("SEM_COMPRADOR", `nenhum comprador atribuído a peça de escassez (${rotulo})`);
  const porDia: DiaDeEscassez[] = dias.map((dia) => {
    const linhas = linhasEsc.filter((l) => l.dia === dia);
    const doDia = compradoresEsc.filter((c) => c.dia === dia);
    const so = doDia.filter((c) => !c.tierSuperior).length;
    const nomes = [...new Set(linhas.map((l) => nomePorAdId.get(l.adId) ?? l.adId))].sort(porOrdem);
    return {
      dia,
      anunciosNoAr: nomes,
      investimentoComImposto: linhas.reduce((s, l) => s + l.investimentoComImposto, 0),
      compradores: doDia.length,
      soIngresso: so,
      parcelaSoIngresso: parcela(so, doDia.length, dia),
    };
  });
  const soTotal = compradoresEsc.filter((c) => !c.tierSuperior).length;

  // ---- Copy igual (AC6) ----
  const copy = copyDosAnuncios(todosOsAdIds, input.textosDosAnuncios);

  const noRanking = totalDoRanking.compradores;
  const naEscassez = compradoresEsc.length;
  const total = input.compradores.length;
  const temAdLevel = anuncios.length > 0;
  return {
    aplicavel: temAdLevel,
    ...(temAdLevel ? {} : { motivo: "SEM_AD_LEVEL" as const }),
    vendasComConteudo,
    investimentoTotal,
    linhasDoAdLevel: anuncios.length,
    ranking,
    totalDoRanking,
    atribuicao: {
      compradores: total,
      noRanking,
      naEscassez,
      adIdForaDoAdLevel: foraDoAdLevel,
      semAdId,
      memoria:
        `compradores de captação ${fmtInt(total)} = no ranking ${fmtInt(noRanking)} + peças de escassez ${fmtInt(naEscassez)}` +
        ` + ad_id fora do ad-level de captação ${fmtInt(foraDoAdLevel)} + sem ad_id no utm_content ${fmtInt(semAdId)}`,
    },
    formatos,
    publicos,
    escassez: {
      termos: [...TERMOS_DE_ESCASSEZ],
      anuncios: escassezAnuncios,
      porDia,
      compradoresSemData: compradoresEsc.filter((c) => !c.dia).length,
      total: {
        ...metricasDe({ linhas: linhasEsc, compradores: compradoresEsc }, "peças de escassez", investimentoTotal, vendasComConteudo),
        soIngresso: soTotal,
        parcelaSoIngresso: parcela(soTotal, compradoresEsc.length, "peças de escassez"),
      },
    },
    copy,
  };
}

/**
 * AC6 — a copy (`title` + `body` do cache) dos anúncios de captação do período.
 * Anúncio sem nenhum dos dois conta como "texto indisponível"; entre os que
 * têm texto, um só par (title, body) → a diferença de resultado vem só da imagem.
 */
export function copyDosAnuncios(
  adIds: readonly string[],
  textos: Readonly<Record<string, TextoDoAnuncio>> | undefined,
): CopyDosAnuncios {
  const anuncios = adIds.length;
  if (!textos) {
    return {
      anuncios,
      comTexto: 0,
      textoIndisponivel: anuncios,
      copiesDistintas: 0,
      veredito: "nao-lido",
      texto: "o texto dos criativos não foi lido nesta geração — a comparação de copy não foi feita",
    };
  }
  const pares = new Set<string>();
  let comTexto = 0;
  for (const id of adIds) {
    const t = textos[id];
    const title = (t?.title ?? "").trim();
    const body = (t?.body ?? "").trim();
    if (!title && !body) continue;
    comTexto += 1;
    pares.add(JSON.stringify([title, body]));
  }
  const indisponivel = anuncios - comTexto;
  const sufixo = indisponivel > 0 ? ` ${fmtInt(indisponivel)} anúncio(s) com texto indisponível no cache.` : "";
  if (comTexto === 0) {
    return { anuncios, comTexto, textoIndisponivel: indisponivel, copiesDistintas: 0, veredito: "sem-texto", texto: `Nenhum dos ${fmtInt(anuncios)} anúncio(s) tem texto (title/body) no cache — copy não comparada.` };
  }
  if (comTexto === 1) {
    return { anuncios, comTexto, textoIndisponivel: indisponivel, copiesDistintas: 1, veredito: "um-anuncio-com-texto", texto: `Só 1 anúncio tem texto no cache — não há com o que comparar.${sufixo}` };
  }
  if (pares.size === 1) {
    return {
      anuncios,
      comTexto,
      textoIndisponivel: indisponivel,
      copiesDistintas: 1,
      veredito: "so-imagem",
      texto: `Os ${fmtInt(comTexto)} anúncios com texto no cache têm o mesmo title e o mesmo body: a diferença de resultado entre eles vem só da imagem.${sufixo}`,
    };
  }
  return {
    anuncios,
    comTexto,
    textoIndisponivel: indisponivel,
    copiesDistintas: pares.size,
    veredito: "copies-diferentes",
    texto: `Os ${fmtInt(comTexto)} anúncios com texto no cache têm ${fmtInt(pares.size)} copies diferentes (title + body).${sufixo}`,
  };
}

// ---------------------------------------------------------------------------
// AC2 (R12-3) — melhor versão isolada
// ---------------------------------------------------------------------------

/** CPA comparado em centavos (o que o documento mostra); `null` nunca chega aqui. */
const centavosDoCpa = (v: VersaoIsolada) => Math.round(v.cpa.valor! * 100);

/**
 * A ordem da melhor versão: menor CPA (em centavos); empate → maior ROAS
 * (ROAS "—" perde para qualquer número); empate → menor Ad ID (AUTO-DECISION
 * da story: determinístico e sem outro critério do dono).
 */
export function ordemDaMelhorVersao(a: VersaoIsolada, b: VersaoIsolada): number {
  const cpa = centavosDoCpa(a) - centavosDoCpa(b);
  if (cpa !== 0) return cpa;
  const ra = a.roas.valor;
  const rb = b.roas.valor;
  if (ra !== rb) {
    if (ra === null) return 1;
    if (rb === null) return -1;
    return rb - ra;
  }
  return porOrdem(a.adId, b.adId);
}

/**
 * R12-3 — "menor cpa com maior roas, mínimo de 5% do valor total investido" +
 * "ROAS desempata e captação do lançamento": entre as versões com investimento
 * ≥ 5% do investimento de captação do lançamento, a de menor CPA; o ROAS
 * desempata. Versão sem comprador (CPA "—") nunca é a melhor; abaixo do mínimo
 * nunca é escolhida, mesmo com CPA menor.
 */
export function escolherMelhorVersao(versoes: readonly VersaoIsolada[], investimentoDeCaptacao: number): MelhorVersao {
  if (!(investimentoDeCaptacao > 0)) {
    return {
      versao: null,
      motivo: "SEM_INVESTIMENTO_DE_CAPTACAO",
      elegiveis: 0,
      memoria: "sem investimento de captação no lançamento — não há mínimo de 5% para comparar versões",
    };
  }
  const minimo = investimentoDeCaptacao * LIMIAR_DA_MELHOR_VERSAO;
  const elegiveis = versoes.filter((v) => v.investimentoComImposto >= minimo);
  const comCpa = elegiveis.filter((v) => v.cpa.valor !== null);
  const base = `mínimo ${fmtReais(minimo)} (5% do investimento de captação ${fmtReais(investimentoDeCaptacao)})`;
  if (elegiveis.length === 0) {
    return { versao: null, motivo: "SEM_VERSAO_ELEGIVEL", elegiveis: 0, memoria: `nenhuma versão com ≥ 5% do investimento de captação — ${base}` };
  }
  if (comCpa.length === 0) {
    return {
      versao: null,
      motivo: "SEM_COMPRADOR_NAS_ELEGIVEIS",
      elegiveis: elegiveis.length,
      memoria: `nenhuma das ${fmtInt(elegiveis.length)} versão(ões) com ≥ 5% do investimento de captação tem comprador (CPA "—") — ${base}`,
    };
  }
  const melhor = [...comCpa].sort(ordemDaMelhorVersao)[0]!;
  return {
    versao: melhor,
    elegiveis: elegiveis.length,
    memoria: `menor CPA entre ${fmtInt(comCpa.length)} versão(ões) com comprador e ≥ 5% do investimento de captação (${base}); empate → maior ROAS → menor Ad ID`,
  };
}

/** A mídia por anúncio com a melhor versão de cada linha do ranking (composição do payload; não muta a entrada). */
export function comMelhorVersao(m: MidiaPorAnuncio, investimentoDeCaptacao: number): MidiaPorAnuncio {
  const minimo = investimentoDeCaptacao * LIMIAR_DA_MELHOR_VERSAO;
  return {
    ...m,
    ranking: m.ranking.map((l) => ({ ...l, melhorVersao: escolherMelhorVersao(l.versoes, investimentoDeCaptacao) })),
    criterioDaMelhorVersao: {
      limiar: LIMIAR_DA_MELHOR_VERSAO,
      investimentoDeCaptacao,
      minimo,
      memoria: `investimento de captação do lançamento c/ imposto ${fmtReais(investimentoDeCaptacao)} × 5% = ${fmtReais(minimo)}`,
    },
  };
}
