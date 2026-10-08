/**
 * Story 49.19 — teste de LP no Debriefing (passo 6 do método
 * `leitura-parcial-lancamento.md`).
 *
 * **Puro.** O Motor II (`computeDebriefingAudience`) prepara a entrada — as
 * MESMAS linhas anúncio × dia de captação da mídia por anúncio (49.18), agora
 * com a campanha (id) e o nome do conjunto, e os MESMOS compradores de captação
 * atribuídos pelo ad_id do `co=` — e recebe a saída em `publico.testeDeLp`.
 * Sem banco, relógio nem Meta.
 *
 * Regras (story 49.19):
 * - AC1: a LP de cada campanha sai do código no NOME da campanha, pelos parsers
 *   que já existem: o bloco `--lp…` do `parseUtmTerm` (`RE_LP`), com o rótulo de
 *   `rotuloLp` e a chave de `chaveLp` (a 1ª letra: `lpaa` e `lpa` são a mesma
 *   LPA, como na tabela de LPs); e, para o nome do Epic 47
 *   (`expert_produto_funil_oferta_ano_temp_leilao_formato_lp`), o 9º campo com o
 *   formato `FORMATO_DO_CODIGO.lp`. Campanha sem código fica fora do teste e é
 *   contada (quantas e quanto investimento);
 * - AC2: só formam par as LPs com o MESMO formato (`formatoPeloNomeDaCampanha`,
 *   o da 49.18), os MESMOS nomes de anúncio e os MESMOS nomes de conjunto
 *   (`adset_name`, porque os ids de conjunto mudam de campanha para campanha).
 *   Os conjuntos de nomes são os que aparecem no ad-level da janela do relatório,
 *   comparados por `normalizarNomeCampanha` (sem acento, minúsculo, sem o
 *   sufixo de cópia). Grupo sem par sai com o motivo;
 * - AC3: a janela de cada par = os dias em que TODAS as LPs do par tiveram
 *   investimento (dentro da janela do relatório, que o loader já cortou);
 * - AC4: por LP, visitas (`landing_page_view`), compras, compras ÷ visitas, CPA,
 *   ROAS e tier superior (as métricas da 49.18, `metricasDe`), e o Fisher exato
 *   bilateral sobre (compras, visitas − compras): p < 0,05 → veredito; senão
 *   "empate, segue rodando"; janela com menos de 3 dias → "sem leitura";
 * - AC5: cada nome de anúncio do par, com compras ÷ visitas em cada LP;
 * - AC6: a parcela do investimento do par em cada LP e o sinal quando a LP com
 *   menor compras ÷ visitas recebe a maior parcela.
 *
 * Compras ÷ visitas segue a regra da 49.18: o numerador leva só os compradores
 * de Ad IDs que têm `landing_page_view` em alguma linha da janela (anúncio sem
 * a medida não infla a taxa da LP). Comprador sem dia de compra legível não
 * entra em janela nenhuma.
 */

import { FORMATO_DO_CODIGO, normalizarNomeCampanha } from "@loyola-x/shared";
import { chaveLp, parseUtmTerm, rotuloLp } from "./utm-term.js";
import { fisherExatoBilateral, ALFA_DO_FISHER } from "./fisher-exato.js";
import { fmtNumero, fmtReais, type Metrica } from "./debriefing-money-time-engine.js";
import {
  formatoPeloNomeDaCampanha,
  metricasDe,
  type AnuncioDiaDaMidia,
  type CompradorDaMidia,
  type MetricasDaMidia,
} from "./debriefing-midia-anuncios.js";

// ---------------------------------------------------------------------------
// Constantes (testadas)
// ---------------------------------------------------------------------------

/** Abaixo disto a LP fica "sem leitura" (método, passo 6). */
export const DIAS_MINIMOS_DO_TESTE_DE_LP = 3;

// ---------------------------------------------------------------------------
// AC1 — a LP pelo nome da campanha
// ---------------------------------------------------------------------------

export interface LpDaCampanha {
  /** A chave (`chaveLp`): "LPA". */
  lp: string;
  /** O rótulo fino (`rotuloLp`): "LPA", "LPAA". */
  rotulo: string;
  regra: "bloco-lp" | "nomenclatura-epic-47";
}

/** Os 9 campos do nome do Epic 47 (`expert_produto_funil_oferta_ano_temp_leilao_formato_lp`). */
const CAMPOS_DO_NOME_DO_EPIC_47 = 9;

/**
 * A LP de uma campanha pelo código no nome. Primeiro o bloco `--lp…` (os nomes
 * de lançamento: `…--videos--lpa`); depois o último campo do nome do Epic 47.
 * Sem código → `null` (a campanha fica fora do teste).
 */
export function lpDaCampanha(campaignName: string | null | undefined): LpDaCampanha | null {
  const nome = (campaignName ?? "").trim();
  if (!nome) return null;
  const doBloco = rotuloLp(parseUtmTerm(nome).lp);
  if (doBloco) return { lp: chaveLp(doBloco), rotulo: doBloco, regra: "bloco-lp" };
  const campos = nome.split("_");
  const ultimo = campos[campos.length - 1] ?? "";
  if (campos.length === CAMPOS_DO_NOME_DO_EPIC_47 && FORMATO_DO_CODIGO.lp.regex.test(ultimo)) {
    const rotulo = rotuloLp(ultimo)!;
    return { lp: chaveLp(rotulo), rotulo, regra: "nomenclatura-epic-47" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Uma linha anúncio × dia de captação (a da 49.18), com a campanha e o conjunto. */
export interface AnuncioDiaDoTesteDeLp extends AnuncioDiaDaMidia {
  /** `null` = a linha não trouxe o id (a campanha é identificada pelo nome). */
  campaignId: string | null;
  /** `adset_name` da linha; `null` = sem nome (o conjunto não é identificado). */
  adsetName: string | null;
}

export interface EntradaDoTesteDeLp {
  anuncios: readonly AnuncioDiaDoTesteDeLp[];
  /** Os compradores de captação da 49.18 (pessoa, ad_id do `co=`, faturamento, tier, dia). */
  compradores: readonly CompradorDaMidia[];
  /** As planilhas de venda trazem `utm_content` (senão nenhuma compra é atribuída). */
  vendasComConteudo: boolean;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export type FormatoDoTesteDeLp = "video" | "estatico";

export interface CampanhaDoTesteDeLp {
  campanha: string;
  campaignId: string | null;
  lp: string | null;
  rotuloLp: string | null;
  /** `null` = sem `--videos`/`--estaticos` no nome. */
  formato: FormatoDoTesteDeLp | null;
  /** Nomes de anúncio (como aparecem), um por nome normalizado; `null` = algum anúncio sem nome. */
  anuncios: string[] | null;
  /** Nomes de conjunto (como aparecem), um por nome normalizado; `null` = alguma linha sem `adset_name`. */
  conjuntos: string[] | null;
  investimentoComImposto: number;
  /** Dias com investimento. */
  dias: number;
}

export type CriterioDoPar = "formato" | "anuncios" | "conjuntos";
export const CRITERIOS_DO_PAR: readonly CriterioDoPar[] = ["formato", "anuncios", "conjuntos"];

export interface GrupoSemPar {
  lp: string;
  campanhas: string[];
  formato: FormatoDoTesteDeLp | null;
  anuncios: string[] | null;
  conjuntos: string[] | null;
  investimentoComImposto: number;
  /** `null` = não há outra LP no lançamento. */
  maisProxima: string | null;
  /** Em que o grupo difere da LP mais próxima (vazio quando não há outra LP). */
  diferencas: CriterioDoPar[];
  texto: string;
}

export interface LadoDoPar extends MetricasDaMidia {
  lp: string;
  rotulos: string[];
  campanhas: string[];
  /** Compradores na janela dos Ad IDs com `landing_page_view` — o numerador da taxa e do Fisher. */
  comprasNaTaxa: number;
}

export interface CriativoNoPar {
  nome: string;
  porLp: { lp: string; landingPageViews: number | null; compras: number; compraPorVisita: Metrica }[];
}

export type ResultadoDoPar = "veredito" | "empate" | "sem-leitura";

export type MotivoSemLeitura =
  | "SEM_UTM_CONTENT_NA_VENDA"
  | "MENOS_DE_3_DIAS"
  | "LANDING_PAGE_VIEW_AUSENTE"
  | "SEM_VISITAS"
  | "COMPRAS_ACIMA_DAS_VISITAS";

export interface ParDeLp {
  lps: [string, string];
  /** Quantas LPs têm a mesma assinatura (formato + anúncios + conjuntos): com 3+, há várias comparações (REQ-002). */
  lpsNaAssinatura: number;
  formato: FormatoDoTesteDeLp;
  anuncios: string[];
  conjuntos: string[];
  janela: { dias: string[]; inicio: string | null; fim: string | null; memoria: string };
  investimentoDoPar: number;
  lados: [LadoDoPar, LadoDoPar];
  /** A tabela do Fisher e o p-valor; `null` = sem leitura. */
  fisher: { tabela: [[number, number], [number, number]]; pValor: number; abaixoDoAlfa: boolean } | null;
  resultado: ResultadoDoPar;
  vencedora: string | null;
  motivoSemLeitura: MotivoSemLeitura | null;
  texto: string;
  /** AC6: a LP com menor compras ÷ visitas recebe a maior parcela da verba do par. */
  verbaInvertida: boolean;
  textoDaVerba: string | null;
  mesmoCriativo: CriativoNoPar[];
}

export interface TesteDeLp {
  aplicavel: boolean;
  motivo?: "SEM_AD_LEVEL";
  vendasComConteudo: boolean;
  diasMinimos: number;
  alfa: number;
  campanhas: CampanhaDoTesteDeLp[];
  porLp: { lp: string; rotulos: string[]; campanhas: number; investimentoComImposto: number }[];
  semLp: { campanhas: number; investimentoComImposto: number; nomes: string[]; memoria: string };
  pares: ParDeLp[];
  semPar: GrupoSemPar[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function porOrdem(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fmtInt(v: number): string {
  return fmtNumero(v, 0);
}

/** O p-valor no texto: "p = 0,0037"; abaixo de 0,0001, "p < 0,0001" (4 casas não o mostram). */
export function textoDoPValor(p: number): string {
  return p < 0.0001 ? "p < 0,0001" : `p = ${fmtNumero(p, 4)}`;
}

function diaBr(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

/** Nomes distintos por `normalizarNomeCampanha` (o primeiro que aparece, na ordem do normalizado); algum vazio → `null`. */
function nomesDistintos(nomes: readonly (string | null)[]): string[] | null {
  const porChave = new Map<string, string>();
  for (const n of nomes) {
    const t = (n ?? "").trim();
    const k = normalizarNomeCampanha(t);
    if (!k) return null;
    if (!porChave.has(k)) porChave.set(k, t);
  }
  return [...porChave.entries()].sort((a, b) => porOrdem(a[0], b[0])).map(([, v]) => v);
}

function chaveDosNomes(nomes: readonly string[]): string {
  return JSON.stringify(nomes.map((n) => normalizarNomeCampanha(n)).sort(porOrdem));
}

const ROTULO_DO_CRITERIO: Readonly<Record<CriterioDoPar, string>> = {
  formato: "formato",
  anuncios: "nomes de anúncio",
  conjuntos: "nomes de conjunto",
};

const ROTULO_DO_FORMATO: Readonly<Record<FormatoDoTesteDeLp, string>> = { video: "vídeo", estatico: "estático" };

/** Os compradores na janela dos Ad IDs com `landing_page_view` em alguma linha (a regra da 49.18). */
function comprasComVisita(linhas: readonly AnuncioDiaDaMidia[], compradores: readonly CompradorDaMidia[]): number {
  const comLpv = new Set(linhas.filter((l) => l.landingPageViews !== null).map((l) => l.adId));
  return compradores.filter((c) => c.adId !== null && comLpv.has(c.adId)).length;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

interface Grupo {
  lp: string;
  rotulos: Set<string>;
  campanhas: string[];
  formato: FormatoDoTesteDeLp | null;
  anuncios: string[] | null;
  conjuntos: string[] | null;
  /** `null` = algum critério não identificado (nunca forma par). */
  assinatura: string | null;
  investimentoComImposto: number;
}

export function computeTesteDeLp(input: EntradaDoTesteDeLp): TesteDeLp {
  const { anuncios, vendasComConteudo } = input;
  const alfa = ALFA_DO_FISHER.valor;
  if (anuncios.length === 0) {
    return {
      aplicavel: false,
      motivo: "SEM_AD_LEVEL",
      vendasComConteudo,
      diasMinimos: DIAS_MINIMOS_DO_TESTE_DE_LP,
      alfa,
      campanhas: [],
      porLp: [],
      semLp: { campanhas: 0, investimentoComImposto: 0, nomes: [], memoria: "sem ad-level de captação no período" },
      pares: [],
      semPar: [],
    };
  }

  // ---- Campanhas (AC1) ----
  const chaveDaCampanha = (a: AnuncioDiaDoTesteDeLp) => a.campaignId ?? `nome:${a.campaignName ?? ""}`;
  const linhasPorCampanha = new Map<string, AnuncioDiaDoTesteDeLp[]>();
  for (const a of anuncios) {
    const k = chaveDaCampanha(a);
    const l = linhasPorCampanha.get(k) ?? [];
    l.push(a);
    linhasPorCampanha.set(k, l);
  }
  const campanhaPorAdId = new Map<string, string>();
  for (const a of [...anuncios].sort((x, y) => porOrdem(x.dia, y.dia))) campanhaPorAdId.set(a.adId, chaveDaCampanha(a));

  const campanhas: (CampanhaDoTesteDeLp & { chave: string })[] = [...linhasPorCampanha.entries()].map(([chave, linhas]) => {
    const nome = [...linhas].sort((x, y) => porOrdem(y.dia, x.dia)).find((l) => (l.campaignName ?? "").trim())?.campaignName?.trim() ?? chave;
    const lp = lpDaCampanha(nome);
    return {
      chave,
      campanha: nome,
      campaignId: linhas[0]!.campaignId,
      lp: lp?.lp ?? null,
      rotuloLp: lp?.rotulo ?? null,
      formato: formatoPeloNomeDaCampanha(nome),
      anuncios: nomesDistintos(linhas.map((l) => l.nome)),
      conjuntos: nomesDistintos(linhas.map((l) => l.adsetName)),
      investimentoComImposto: linhas.reduce((s, l) => s + l.investimentoComImposto, 0),
      dias: new Set(linhas.filter((l) => l.investimentoComImposto > 0).map((l) => l.dia)).size,
    };
  });
  campanhas.sort((a, b) => porOrdem(a.campanha, b.campanha) || porOrdem(a.chave, b.chave));

  const semLpCampanhas = campanhas.filter((c) => c.lp === null);
  const invSemLp = semLpCampanhas.reduce((s, c) => s + c.investimentoComImposto, 0);
  const semLp = {
    campanhas: semLpCampanhas.length,
    investimentoComImposto: invSemLp,
    nomes: semLpCampanhas.map((c) => c.campanha),
    memoria: `${fmtInt(semLpCampanhas.length)} campanha(s) de captação sem código de LP no nome, ${fmtReais(invSemLp)} c/ imposto — fora do teste`,
  };

  const porLpMap = new Map<string, { rotulos: Set<string>; campanhas: number; inv: number }>();
  for (const c of campanhas) {
    if (!c.lp) continue;
    const x = porLpMap.get(c.lp) ?? { rotulos: new Set<string>(), campanhas: 0, inv: 0 };
    x.rotulos.add(c.rotuloLp!);
    x.campanhas += 1;
    x.inv += c.investimentoComImposto;
    porLpMap.set(c.lp, x);
  }
  const porLp = [...porLpMap.entries()]
    .sort((a, b) => porOrdem(a[0], b[0]))
    .map(([lp, x]) => ({ lp, rotulos: [...x.rotulos].sort(porOrdem), campanhas: x.campanhas, investimentoComImposto: x.inv }));

  // ---- Grupos (LP × assinatura) (AC2) ----
  const grupos = new Map<string, Grupo>();
  const chavesDasCampanhas = new Map<string, string[]>();
  for (const c of campanhas) {
    if (!c.lp) continue;
    const assinatura =
      c.formato && c.anuncios && c.conjuntos ? JSON.stringify([c.formato, chaveDosNomes(c.anuncios), chaveDosNomes(c.conjuntos)]) : null;
    const chave = assinatura ? `${c.lp}|${assinatura}` : `${c.lp}|campanha:${c.chave}`;
    const g = grupos.get(chave) ?? {
      lp: c.lp,
      rotulos: new Set<string>(),
      campanhas: [],
      formato: c.formato,
      anuncios: c.anuncios,
      conjuntos: c.conjuntos,
      assinatura,
      investimentoComImposto: 0,
    };
    g.rotulos.add(c.rotuloLp!);
    g.campanhas.push(c.campanha);
    g.investimentoComImposto += c.investimentoComImposto;
    grupos.set(chave, g);
    const ks = chavesDasCampanhas.get(chave) ?? [];
    ks.push(c.chave);
    chavesDasCampanhas.set(chave, ks);
  }
  const chaveDoGrupo = new Map<Grupo, string>([...grupos.entries()].map(([k, g]) => [g, k]));

  // Por assinatura: as LPs (cada uma, um grupo).
  const porAssinatura = new Map<string, Grupo[]>();
  for (const g of grupos.values()) {
    if (!g.assinatura) continue;
    const l = porAssinatura.get(g.assinatura) ?? [];
    l.push(g);
    porAssinatura.set(g.assinatura, l);
  }

  const pares: ParDeLp[] = [];
  const emPar = new Set<Grupo>();
  for (const lista of porAssinatura.values()) {
    if (lista.length < 2) continue;
    const ordenada = [...lista].sort((a, b) => porOrdem(a.lp, b.lp));
    for (const g of ordenada) emPar.add(g);
    for (let i = 0; i < ordenada.length; i++) {
      for (let j = i + 1; j < ordenada.length; j++) {
        pares.push(
          parDe(ordenada[i]!, ordenada[j]!, ordenada.length, (g) => chavesDasCampanhas.get(chaveDoGrupo.get(g)!)!, linhasPorCampanha, campanhaPorAdId, input.compradores, vendasComConteudo),
        );
      }
    }
  }
  pares.sort((a, b) => porOrdem(a.formato, b.formato) || porOrdem(a.lps.join("|"), b.lps.join("|")) || porOrdem(a.conjuntos.join("|"), b.conjuntos.join("|")));

  // ---- Grupos sem par, com o motivo ----
  const todos = [...grupos.values()].sort((a, b) => porOrdem(a.lp, b.lp) || porOrdem(a.campanhas.join("|"), b.campanhas.join("|")));
  const difere = (a: Grupo, b: Grupo): CriterioDoPar[] => {
    const out: CriterioDoPar[] = [];
    if (!a.formato || !b.formato || a.formato !== b.formato) out.push("formato");
    if (!a.anuncios || !b.anuncios || chaveDosNomes(a.anuncios) !== chaveDosNomes(b.anuncios)) out.push("anuncios");
    if (!a.conjuntos || !b.conjuntos || chaveDosNomes(a.conjuntos) !== chaveDosNomes(b.conjuntos)) out.push("conjuntos");
    return out;
  };
  const semPar: GrupoSemPar[] = todos
    .filter((g) => !emPar.has(g))
    .map((g) => {
      const outros = todos.filter((o) => o.lp !== g.lp);
      let maisProxima: Grupo | null = null;
      let diferencas: CriterioDoPar[] = [];
      for (const o of outros) {
        const d = difere(g, o);
        if (maisProxima === null || d.length < diferencas.length) {
          maisProxima = o;
          diferencas = d;
        }
      }
      const naoIdentificados = [
        ...(g.formato ? [] : ["formato (sem --videos/--estaticos no nome)"]),
        ...(g.anuncios ? [] : ["nomes de anúncio (anúncio sem nome)"]),
        ...(g.conjuntos ? [] : ["nomes de conjunto (linha sem adset_name)"]),
      ];
      const texto = !maisProxima
        ? `Sem par: ${g.lp} é a única LP do lançamento no período.`
        : `Sem par: a LP mais próxima é ${maisProxima.lp} (${maisProxima.campanhas.join("; ")}), que difere em ${diferencas.map((d) => ROTULO_DO_CRITERIO[d]).join(", ")}.` +
          (naoIdentificados.length ? ` Não identificado(s) nesta: ${naoIdentificados.join("; ")}.` : "");
      return {
        lp: g.lp,
        campanhas: [...g.campanhas],
        formato: g.formato,
        anuncios: g.anuncios,
        conjuntos: g.conjuntos,
        investimentoComImposto: g.investimentoComImposto,
        maisProxima: maisProxima?.lp ?? null,
        diferencas,
        texto,
      };
    });

  return {
    aplicavel: true,
    vendasComConteudo,
    diasMinimos: DIAS_MINIMOS_DO_TESTE_DE_LP,
    alfa,
    campanhas: campanhas.map(({ chave: _chave, ...c }) => c),
    porLp,
    semLp,
    pares,
    semPar,
  };
}

function parDe(
  g1: Grupo,
  g2: Grupo,
  lpsNaAssinatura: number,
  chavesDe: (g: Grupo) => string[],
  linhasPorCampanha: ReadonlyMap<string, AnuncioDiaDoTesteDeLp[]>,
  campanhaPorAdId: ReadonlyMap<string, string>,
  compradores: readonly CompradorDaMidia[],
  vendasComConteudo: boolean,
): ParDeLp {
  const ladosG = [g1, g2] as const;
  const linhasDe = (g: Grupo) => chavesDe(g).flatMap((k) => linhasPorCampanha.get(k) ?? []);

  // ---- AC3: os dias em que TODAS as LPs do par tiveram investimento ----
  const diasComInvestimento = ladosG.map((g) => {
    const porDia = new Map<string, number>();
    for (const l of linhasDe(g)) porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + l.investimentoComImposto);
    return new Set([...porDia.entries()].filter(([, v]) => v > 0).map(([d]) => d));
  });
  const dias = [...diasComInvestimento[0]].filter((d) => diasComInvestimento[1].has(d)).sort(porOrdem);
  const naJanela = new Set(dias);
  const inicio = dias[0] ?? null;
  const fim = dias[dias.length - 1] ?? null;
  const memoriaDaJanela =
    dias.length === 0
      ? `nenhum dia em que ${g1.lp} e ${g2.lp} tiveram investimento ao mesmo tempo`
      : `dias em que ${g1.lp} e ${g2.lp} tiveram investimento: ${fmtInt(dias.length)} (${diaBr(inicio!)} a ${diaBr(fim!)}` +
        (dias.length < 1 + (Date.parse(fim!) - Date.parse(inicio!)) / 86_400_000 ? ", com intervalo" : "") +
        `) — nunca o acumulado do lançamento`;

  // ---- Linhas e compradores de cada LP na janela ----
  const doLado = ladosG.map((g) => {
    const chaves = new Set(chavesDe(g));
    const linhas: AnuncioDiaDaMidia[] = linhasDe(g).filter((l) => naJanela.has(l.dia));
    const doLp = compradores.filter((c) => c.adId !== null && chaves.has(campanhaPorAdId.get(c.adId) ?? "") && c.dia !== null && naJanela.has(c.dia));
    return { g, linhas, compradores: doLp };
  });
  const investimentoDoPar = doLado.reduce((s, x) => s + x.linhas.reduce((t, l) => t + l.investimentoComImposto, 0), 0);
  const rotuloDoTotal = `investimento do par ${g1.lp} × ${g2.lp} na janela`;
  const lados = doLado.map(({ g, linhas, compradores: cs }) => ({
    lp: g.lp,
    rotulos: [...g.rotulos].sort(porOrdem),
    campanhas: [...g.campanhas],
    ...metricasDe({ linhas, compradores: cs }, `${g.lp} na janela do par`, investimentoDoPar, vendasComConteudo, rotuloDoTotal),
    comprasNaTaxa: comprasComVisita(linhas, cs),
  })) as [LadoDoPar, LadoDoPar];

  // ---- AC4: sem leitura × Fisher ----
  let motivoSemLeitura: MotivoSemLeitura | null = null;
  let textoSemLeitura = "";
  if (!vendasComConteudo) {
    motivoSemLeitura = "SEM_UTM_CONTENT_NA_VENDA";
    textoSemLeitura = "as planilhas de venda não trazem utm_content — nenhuma compra é atribuída a LP";
  } else if (dias.length < DIAS_MINIMOS_DO_TESTE_DE_LP) {
    motivoSemLeitura = "MENOS_DE_3_DIAS";
    textoSemLeitura = `a janela comum tem ${fmtInt(dias.length)} dia(s), menos que os ${fmtInt(DIAS_MINIMOS_DO_TESTE_DE_LP)} do método`;
  } else if (lados.some((l) => l.landingPageViews === null)) {
    motivoSemLeitura = "LANDING_PAGE_VIEW_AUSENTE";
    textoSemLeitura = `a Meta não devolveu landing_page_view na janela para ${lados.filter((l) => l.landingPageViews === null).map((l) => l.lp).join(" e ")} — sem a métrica que decide`;
  } else if (lados.some((l) => l.landingPageViews === 0)) {
    motivoSemLeitura = "SEM_VISITAS";
    textoSemLeitura = `zero landing_page_view na janela para ${lados.filter((l) => l.landingPageViews === 0).map((l) => l.lp).join(" e ")}`;
  } else if (lados.some((l) => l.comprasNaTaxa > l.landingPageViews!)) {
    motivoSemLeitura = "COMPRAS_ACIMA_DAS_VISITAS";
    textoSemLeitura = `compras acima das visitas em ${lados.filter((l) => l.comprasNaTaxa > l.landingPageViews!).map((l) => l.lp).join(" e ")} — a tabela do teste não fecha`;
  }

  let fisher: ParDeLp["fisher"] = null;
  let resultado: ResultadoDoPar = "sem-leitura";
  let vencedora: string | null = null;
  let texto: string;
  if (motivoSemLeitura) {
    texto = `Sem leitura: ${textoSemLeitura}.`;
  } else {
    const [a, b] = lados;
    const tabela: [[number, number], [number, number]] = [
      [a.comprasNaTaxa, a.landingPageViews! - a.comprasNaTaxa],
      [b.comprasNaTaxa, b.landingPageViews! - b.comprasNaTaxa],
    ];
    const r = fisherExatoBilateral(tabela[0][0], tabela[0][1], tabela[1][0], tabela[1][1]);
    fisher = { tabela, pValor: r.pValor, abaixoDoAlfa: r.abaixoDoAlfa };
    const taxa = (l: LadoDoPar) => l.comprasNaTaxa / l.landingPageViews!;
    if (r.abaixoDoAlfa) {
      resultado = "veredito";
      const [venc, perd] = taxa(a) > taxa(b) ? [a, b] : [b, a];
      vencedora = venc.lp;
      texto = `Veredito: ${venc.lp} vence ${perd.lp} em compras ÷ visitas (${fmtNumero(taxa(venc) * 100, 2)}% × ${fmtNumero(taxa(perd) * 100, 2)}%; Fisher exato bilateral, ${textoDoPValor(r.pValor)} < ${fmtNumero(ALFA_DO_FISHER.valor, 2)}).`;
    } else {
      resultado = "empate";
      texto = `Empate, segue rodando: ${a.lp} ${fmtNumero(taxa(a) * 100, 2)}% × ${b.lp} ${fmtNumero(taxa(b) * 100, 2)}% em compras ÷ visitas (Fisher exato bilateral, ${textoDoPValor(r.pValor)} ≥ ${fmtNumero(ALFA_DO_FISHER.valor, 2)}).`;
    }
  }

  // ---- AC6: para onde vai a verba ----
  let verbaInvertida = false;
  let textoDaVerba: string | null = null;
  const [x, y] = lados;
  if (x.compraPorVisita.valor !== null && y.compraPorVisita.valor !== null && x.compraPorVisita.valor !== y.compraPorVisita.valor) {
    const [pior, melhor] = x.compraPorVisita.valor < y.compraPorVisita.valor ? [x, y] : [y, x];
    if (pior.investimentoComImposto > melhor.investimentoComImposto) {
      verbaInvertida = true;
      const parcela = pior.pctDaVerba.valor ?? 0;
      textoDaVerba =
        `A LP com menor compras ÷ visitas (${pior.lp}, ${fmtNumero(pior.compraPorVisita.valor!, 2)}%) recebe a maior parcela da verba do par (${fmtNumero(parcela, 2)}%)` +
        // REQ-001 (gate da 49.19, opção b do @po): o texto segue o resultado do par.
        (resultado === "veredito"
          ? "."
          : resultado === "empate"
            ? " — a diferença de taxa não é significativa, mas a CBO está pondo mais verba nela."
            : ` — sem leitura: ${textoSemLeitura}; o teste não rodou e a taxa ainda não indica perdedora.`);
    }
  }

  // ---- AC5: o mesmo criativo nas duas LPs ----
  const nomesDoPar = (g1.anuncios ?? []).map((n) => ({ nome: n, chave: normalizarNomeCampanha(n) }));
  const mesmoCriativo: CriativoNoPar[] = nomesDoPar.map(({ nome, chave }) => ({
    nome,
    porLp: doLado.map(({ g, linhas, compradores: cs }) => {
      const doNome = linhas.filter((l) => normalizarNomeCampanha((l.nome ?? "").trim()) === chave);
      const ids = new Set(doNome.map((l) => l.adId));
      const csDoNome = cs.filter((c) => c.adId !== null && ids.has(c.adId));
      const m = metricasDe({ linhas: doNome, compradores: csDoNome }, `"${nome}" em ${g.lp} na janela do par`, investimentoDoPar, vendasComConteudo, rotuloDoTotal);
      return { lp: g.lp, landingPageViews: m.landingPageViews, compras: comprasComVisita(doNome, csDoNome), compraPorVisita: m.compraPorVisita };
    }),
  }));

  return {
    lps: [g1.lp, g2.lp],
    lpsNaAssinatura,
    formato: g1.formato!,
    anuncios: [...(g1.anuncios ?? [])],
    conjuntos: [...(g1.conjuntos ?? [])],
    janela: { dias, inicio, fim, memoria: memoriaDaJanela },
    investimentoDoPar,
    lados,
    fisher,
    resultado,
    vencedora,
    motivoSemLeitura,
    texto,
    verbaInvertida,
    textoDaVerba,
    mesmoCriativo,
  };
}

/** Rótulo do formato do par para o documento. */
export function rotuloDoFormatoDoPar(f: FormatoDoTesteDeLp): string {
  return ROTULO_DO_FORMATO[f];
}
