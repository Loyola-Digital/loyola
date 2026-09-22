/**
 * Combinações de cenários — a região direita (U:AG) das abas
 * `[2] Leads Orgânicos` (Story 48.3) e `[3] Leads Pagos` (Story 48.4).
 *
 * A parte dos PAGOS fica na seção "Fontes pagas": reaproveita a cadeia de
 * deduções e o atingimento daqui e acrescenta tráfego, margem por plataforma
 * e o resumo por fonte com CPL máximo. A seção "Resumo Final" (Story 48.5,
 * aba 4) consolida uma combinação orgânica com uma paga — sem recalcular
 * nada das duas.
 *
 * ## O que uma combinação é
 *
 * A aba 2 tem cinco combinações independentes (colunas Y, AA, AC, AE, AG). Em
 * cada uma, quem planeja escolhe UM cenário (1…10) por canal orgânico — ou
 * deixa vazio — e a planilha responde com:
 *
 *   1. a receita de cada canal e a receita bruta (RN-016, RN-017);
 *   2. a cadeia de deduções e a margem de contribuição (RN-018, RN-019);
 *   3. o atingimento da meta de margem dos orgânicos e o gap (RN-020);
 *   4. vendas, leads e conversão por canal e os totais (RN-013, RN-021…023).
 *
 * As grades por canal (série de receita, escada, vendas, leads, faixas) são
 * do motor da 48.2 (`gradeOrganica`); este módulo só LÊ as grades — nada aqui
 * refaz uma conta da 48.2 (E4 do epic).
 *
 * ## Chaves de canal (PO-01 da story)
 *
 * Os dois módulos existentes soletram o sexto canal de forma diferente:
 * `CANAIS_ORGANICOS` da 48.2 usa `area_membros`; a derivação da 48.1 expõe
 * `canais.areaMembros` e `baseAreaMembros`. A taxonomia CANÔNICA — do banco,
 * do payload, das combinações e deste módulo — é a da 48.2. A ponte para a
 * 48.1 é `origemDoCanalNaAba1`, a única função que conhece os dois lados.
 *
 * ## Duas cadeias (D10) e `null` = "sem base" (D3)
 *
 * Como na 48.2: `*Bruto` é a conta da planilha (quociente sobre quociente),
 * o que o §2.4 da spec valida; sem sufixo é a cadeia do produto, sobre os
 * inteiros arredondados para cima. Denominador zero ou entrada `null` devolve
 * `null`, e a tela mostra "—".
 *
 * ## O que NÃO reproduz da planilha
 *
 *   - DV-008: sem caixa marcada, `INDEX/MATCH` dava `#N/A` em leads, a
 *     conversão virava 0 por `IFERROR` e o total de leads quebrava em cascata.
 *     Aqui o nível assumido é um radio (D12): sem nível, leads e conversão do
 *     canal são `null` e os totais que dependem deles também — sem exceção,
 *     sem zero disfarçado.
 *   - `IFERROR(vendas/leads, 0)`: conversão sem base é `null`, não 0.
 *   - Seleção fora de 1…10 (`#N/A` em cascata na planilha): impossível pela
 *     tela e 400 na API; aqui é exceção explícita, nunca silêncio.
 *
 * E o que reproduz de propósito: seleção vazia = receita zero (RN-016); a
 * conversão do resumo é `vendas ÷ leads` com os inteiros do produto (D10).
 *
 * Módulo FOLHA por valor: nenhum `import` de valor, para o web importar por
 * subpath sem arrastar o resto do pacote (lição da 29.46). Os `import type`
 * abaixo são apagados na compilação e não criam dependência em tempo de
 * execução — é o mesmo mecanismo que já permitia ao web importar `type` do
 * `index.ts` antes da 29.46.
 */

import type { CanalOrganico, Entrada, FontePaga, GradeOrganica, GradePaga, ParametrosOrganicos, ParametrosPagos } from "./planejamento-cenarios.js";
import type { CanalDaAba1, DerivadosFinanceiros, InputsFinanceiros } from "./planejamento-inputs-financeiros.js";

// ------------------------------------------------------------------
// Taxonomia e formas persistidas
// ------------------------------------------------------------------

/** Cinco combinações, fixas (colunas Y, AA, AC, AE, AG da planilha). */
export const COMBINACOES = 5;
/** Índices 1…5, na ordem da tela. */
export const INDICES_DAS_COMBINACOES = [1, 2, 3, 4, 5] as const;
/** Os seis canais, na ordem da planilha — cópia local da 48.2 (módulo folha não importa valor). */
const CANAIS = ["whatsapp", "email", "instagram", "telegram", "youtube", "area_membros"] as const satisfies readonly CanalOrganico[];
/** Dez cenários — o mesmo `CENARIOS` da 48.2, repetido pelo mesmo motivo. O nº de níveis vem da própria grade (`escada.length`). */
const CENARIOS = 10;

/** As sete entradas manuais de um bloco (F{r0+2}…F{r0+5}, F{r0+7}, D1, D12), como a API persiste. */
export const CAMPOS_DO_BLOCO_ORGANICO = [
  "conversaoMedia",
  "variacaoConversao",
  "variacaoReceita",
  "taxaCaptacao",
  "faixaVariacao",
  "fracaoCenario1",
  "nivelAssumido",
] as const;
export type CampoDoBlocoOrganico = (typeof CAMPOS_DO_BLOCO_ORGANICO)[number];
/** Frações como decimal; `nivelAssumido` inteiro 1…8; vazio = `null`. */
export type BlocoOrganico = Record<CampoDoBlocoOrganico, number | null>;

/** Cenário escolhido para um canal: inteiro 1…10 ou vazio (RN-038). */
export type Selecao = number | null;
export type SelecoesPorCanal = Record<CanalOrganico, Selecao>;

export interface CombinacaoPersistida {
  indice: number;
  selecoes: SelecoesPorCanal;
}

/** O que a API guarda e devolve para a aba 2: só entradas (E5). */
export interface OrganicosDoSimulador {
  blocos: Record<CanalOrganico, BlocoOrganico>;
  combinacoes: CombinacaoPersistida[];
}

export function blocoOrganicoVazio(): BlocoOrganico {
  const b = {} as BlocoOrganico;
  for (const k of CAMPOS_DO_BLOCO_ORGANICO) b[k] = null;
  return b;
}

export function selecoesVazias(): SelecoesPorCanal {
  const s = {} as SelecoesPorCanal;
  for (const c of CANAIS) s[c] = null;
  return s;
}

/** Seis blocos vazios e cinco combinações vazias — a forma fixa da tela (PO-02). */
export function organicosVazios(): OrganicosDoSimulador {
  const blocos = {} as Record<CanalOrganico, BlocoOrganico>;
  for (const c of CANAIS) blocos[c] = blocoOrganicoVazio();
  return {
    blocos,
    combinacoes: INDICES_DAS_COMBINACOES.map((indice) => ({ indice, selecoes: selecoesVazias() })),
  };
}

// ------------------------------------------------------------------
// Helpers internos (os mesmos da 48.2, repetidos: módulo folha)
// ------------------------------------------------------------------

function n(v: Entrada): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Divisão que devolve `null` em vez de `Infinity`/`NaN` quando não há base. */
function div(numerador: number | null, denominador: number | null): number | null {
  if (numerador === null || denominador === null) return null;
  if (!(denominador > 0) && !(denominador < 0)) return null; // zero, -0, NaN
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/** Soma em que uma parcela `null` deixa o total sem base (D3). */
function soma(parcelas: readonly (number | null)[]): number | null {
  let total = 0;
  for (const p of parcelas) {
    if (p === null) return null;
    total += p;
  }
  return total;
}

function ehInteiroEntre(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// ------------------------------------------------------------------
// PO-01 — ponte entre a taxonomia canônica (48.2) e a derivação da 48.1
// ------------------------------------------------------------------

/** Canal canônico → chave em `derivados.canais` da 48.1. */
export const CANAL_NA_ABA_1: Record<CanalOrganico, CanalDaAba1> = {
  whatsapp: "whatsapp",
  email: "email",
  instagram: "instagram",
  telegram: "telegram",
  youtube: "youtube",
  area_membros: "areaMembros",
};

/** Canal canônico → campo da base (contagem) nas entradas da 48.1. */
export const BASE_DO_CANAL: Record<CanalOrganico, keyof InputsFinanceiros> = {
  whatsapp: "baseWhatsapp",
  email: "baseEmail",
  instagram: "baseInstagram",
  telegram: "baseTelegram",
  youtube: "baseYoutube",
  area_membros: "baseAreaMembros",
};

/** O que a aba 2 importa da aba 1 para um canal (F{r0}, F{r0+1} e o ticket). */
export interface OrigemDoCanalNaAba1 {
  /** `canais[canal].receita` — `null` quando a margem-alvo dos orgânicos não tem base. */
  metaReceita: number | null;
  base: Entrada;
  ticketMedio: Entrada;
}

export function origemDoCanalNaAba1(
  entradas: InputsFinanceiros,
  derivados: DerivadosFinanceiros,
  canal: CanalOrganico,
): OrigemDoCanalNaAba1 {
  return {
    metaReceita: derivados.canais[CANAL_NA_ABA_1[canal]].receita,
    base: entradas[BASE_DO_CANAL[canal]],
    ticketMedio: entradas.ticketMedio,
  };
}

/** Bloco persistido + origem da aba 1 → os parâmetros que `gradeOrganica` (48.2) recebe. */
export function parametrosDoBloco(bloco: BlocoOrganico, origem: OrigemDoCanalNaAba1): ParametrosOrganicos {
  return {
    metaReceita: origem.metaReceita,
    base: origem.base,
    ticketMedio: origem.ticketMedio,
    conversaoMedia: bloco.conversaoMedia,
    variacaoConversao: bloco.variacaoConversao,
    variacaoReceita: bloco.variacaoReceita,
    fracaoCenario1: bloco.fracaoCenario1,
    taxaCaptacao: bloco.taxaCaptacao,
    faixaVariacao: bloco.faixaVariacao,
  };
}

// ------------------------------------------------------------------
// RN-016 / RN-038 — seleção de cenário
// ------------------------------------------------------------------

/**
 * Receita do canal na combinação: `serie[sel]`; vazio → 0 (reproduz a
 * planilha, RN-016). Fora de 1…10 ou não inteiro é EXCEÇÃO — na planilha era
 * `#N/A` em cascata; a tela usa um seletor fechado e a API responde 400, então
 * chegar aqui é defeito de quem chamou, não "sem base".
 */
export function selecionarReceita(serie: readonly number[], sel: Selecao): number {
  if (sel === null || sel === undefined) return 0;
  if (!ehInteiroEntre(sel, 1, CENARIOS)) throw new RangeError(`seleção de cenário fora de 1…${CENARIOS}: ${String(sel)}`);
  return n(serie[sel - 1]);
}

// ------------------------------------------------------------------
// RN-017 / RN-018 / RN-019 — receita bruta, deduções e margem
// ------------------------------------------------------------------

/** Os seis percentuais de custo da aba 1 (G3:G8). `InputsFinanceiros` satisfaz esta forma. */
export interface PercentuaisDeCusto {
  pctReembolso: Entrada;
  pctMarketplace: Entrada;
  pctImposto: Entrada;
  pctCustoProduto: Entrada;
  pctComissoes: Entrada;
  pctOutrosCustos: Entrada;
}

export interface CadeiaDeDeducoes {
  /** Y10 — Σ receita por canal. */
  receitaBruta: number;
  /** Y18 — `pctReembolso × receitaBruta`. */
  reembolso: number;
  /** Y20 — `receitaBruta − reembolso`. */
  receitaTributavel: number;
  /** Y22…Y26 — cada `pct × receitaTributavel`. */
  deducoes: {
    marketplace: number;
    imposto: number;
    custoProduto: number;
    comissoes: number;
    outros: number;
  };
  totalDeducoes: number;
  /** Y28 — margem de contribuição. */
  mc: number;
  /** Y29 — `mc ÷ receitaBruta`; `null` quando a receita bruta é zero (todas as seleções vazias). */
  mcPct: number | null;
}

export function cadeiaDeDeducoes(receitasPorCanal: readonly number[], pct: PercentuaisDeCusto): CadeiaDeDeducoes {
  const receitaBruta = receitasPorCanal.reduce((acc, r) => acc + n(r), 0);
  const reembolso = n(pct.pctReembolso) * receitaBruta;
  const receitaTributavel = receitaBruta - reembolso;
  const deducoes = {
    marketplace: n(pct.pctMarketplace) * receitaTributavel,
    imposto: n(pct.pctImposto) * receitaTributavel,
    custoProduto: n(pct.pctCustoProduto) * receitaTributavel,
    comissoes: n(pct.pctComissoes) * receitaTributavel,
    outros: n(pct.pctOutrosCustos) * receitaTributavel,
  };
  const totalDeducoes = deducoes.marketplace + deducoes.imposto + deducoes.custoProduto + deducoes.comissoes + deducoes.outros;
  const mc = receitaTributavel - totalDeducoes;
  return { receitaBruta, reembolso, receitaTributavel, deducoes, totalDeducoes, mc, mcPct: div(mc, receitaBruta) };
}

// ------------------------------------------------------------------
// RN-020 — meta, atingimento e gap
// ------------------------------------------------------------------

export interface AtingimentoDaMeta {
  /** W4 — meta de margem de contribuição dos orgânicos (aba 1, F15). Vazia vale zero. */
  meta: number;
  /** Y2 — `mc ÷ meta`, fração; `null` quando a meta é zero (`#DIV/0!` na planilha). */
  atingimento: number | null;
  /** Y5 — `mc − meta`, com sinal. */
  gap: number;
}

export function atingimentoDaMeta(mc: number, metaMargemOrganicos: Entrada): AtingimentoDaMeta {
  const meta = n(metaMargemOrganicos);
  return { meta, atingimento: div(mc, meta), gap: mc - meta };
}

// ------------------------------------------------------------------
// RN-013 / RN-021 / RN-022 / RN-023 — vendas, leads e conversão por canal
// ------------------------------------------------------------------

export interface ResumoDoCanal {
  /** Y11 — receita do cenário escolhido; 0 sem seleção. */
  receita: number;
  /** Cadeia do produto (D10): `grade.vendas[sel]` — inteiro; 0 sem seleção; `null` sem ticket. */
  vendas: number | null;
  /** `grade.leads[nivel][sel]` — inteiro; 0 sem seleção; `null` sem nível (D12) ou sem base. */
  leads: number | null;
  /** `vendas ÷ leads` com os inteiros; `null` sem base (não reproduz o `IFERROR → 0`). */
  conversao: number | null;
  /** Cadeia bruta — o que a planilha mostrava (§2.4). */
  vendasBruto: number | null;
  leadsBruto: number | null;
  conversaoBruto: number | null;
}

/**
 * Resumo de um canal numa combinação. `nivel` é o radio do bloco (1…8) ou
 * `null`; `sel` é o cenário escolhido (1…10) ou `null`.
 *
 *   sem seleção → receita, vendas e leads 0 (o canal não participa), conversão `null`;
 *   com seleção e sem nível → vendas do cenário, leads e conversão `null` (D12, não DV-008);
 *   com os dois → a célula `leads[nivel][sel]` e a conversão com os inteiros.
 */
/** O que `resumoDoCanal` lê de uma grade — `GradeOrganica` e `GradePaga` (48.4) satisfazem. */
export type GradeDeResumo = Pick<GradeOrganica, "receita" | "escada" | "vendas" | "vendasBruto" | "leads" | "leadsBruto">;

export function resumoDoCanal(grade: GradeDeResumo, sel: Selecao, nivel: number | null): ResumoDoCanal {
  if (sel === null || sel === undefined) {
    return { receita: 0, vendas: 0, leads: 0, conversao: null, vendasBruto: 0, leadsBruto: 0, conversaoBruto: null };
  }
  const receita = selecionarReceita(grade.receita, sel);
  const i = sel - 1;
  const vendas = grade.vendas[i] ?? null;
  const vendasBruto = grade.vendasBruto[i] ?? null;
  if (nivel === null || nivel === undefined) {
    return { receita, vendas, leads: null, conversao: null, vendasBruto, leadsBruto: null, conversaoBruto: null };
  }
  if (!ehInteiroEntre(nivel, 1, grade.escada.length)) {
    throw new RangeError(`nível assumido fora de 1…${grade.escada.length}: ${String(nivel)}`);
  }
  const leads = grade.leads[nivel - 1]?.[i] ?? null;
  const leadsBruto = grade.leadsBruto[nivel - 1]?.[i] ?? null;
  return {
    receita,
    vendas,
    leads,
    conversao: div(vendas, leads),
    vendasBruto,
    leadsBruto,
    conversaoBruto: div(vendasBruto, leadsBruto),
  };
}

export interface TotaisDaCombinacao {
  /** Y33 — Σ vendas; `null` se algum canal com seleção está sem base. */
  vendas: number | null;
  /** Y34 — Σ leads; `null` se algum canal com seleção está sem nível ou sem base (não reproduz DV-008). */
  leads: number | null;
  vendasBruto: number | null;
  leadsBruto: number | null;
}

export function totaisDaCombinacao(canais: readonly ResumoDoCanal[]): TotaisDaCombinacao {
  return {
    vendas: soma(canais.map((c) => c.vendas)),
    leads: soma(canais.map((c) => c.leads)),
    vendasBruto: soma(canais.map((c) => c.vendasBruto)),
    leadsBruto: soma(canais.map((c) => c.leadsBruto)),
  };
}

// ------------------------------------------------------------------
// Uma combinação inteira (a coluna Y, AA, … da planilha)
// ------------------------------------------------------------------

export interface CombinacaoOrganica {
  indice: number;
  /** Y11…Y16. */
  receitas: Record<CanalOrganico, number>;
  cadeia: CadeiaDeDeducoes;
  meta: AtingimentoDaMeta;
  /** Y35…Y57. */
  canais: Record<CanalOrganico, ResumoDoCanal>;
  /** Y33, Y34. */
  totais: TotaisDaCombinacao;
}

export function combinacaoOrganica(args: {
  indice: number;
  grades: Record<CanalOrganico, GradeOrganica>;
  selecoes: SelecoesPorCanal;
  /** `nivelAssumido` de cada bloco. */
  niveis: Record<CanalOrganico, number | null>;
  percentuais: PercentuaisDeCusto;
  /** `metaMargemOrganicos` da derivação da 48.1 (F15). */
  metaMargemOrganicos: Entrada;
}): CombinacaoOrganica {
  const receitas = {} as Record<CanalOrganico, number>;
  const canais = {} as Record<CanalOrganico, ResumoDoCanal>;
  for (const c of CANAIS) {
    const resumo = resumoDoCanal(args.grades[c], args.selecoes[c], args.niveis[c]);
    canais[c] = resumo;
    receitas[c] = resumo.receita;
  }
  const cadeia = cadeiaDeDeducoes(
    CANAIS.map((c) => receitas[c]),
    args.percentuais,
  );
  return {
    indice: args.indice,
    receitas,
    cadeia,
    meta: atingimentoDaMeta(cadeia.mc, args.metaMargemOrganicos),
    canais,
    totais: totaisDaCombinacao(CANAIS.map((c) => canais[c])),
  };
}

// ==================================================================
// Fontes pagas — aba `[3] Leads Pagos` (Story 48.4)
// ==================================================================
//
// Três diferenças em relação aos orgânicos (spec §3):
//   1. o TRÁFEGO entra na conta: a verba de cada fonte (aba 1) é descontada
//      da receita líquida da plataforma (RN-027, RN-028) — e é o mesmo nas
//      cinco combinações;
//   2. a grade é de CPL MÁXIMO (RN-025) além de leads;
//   3. as quatro fontes se agrupam em duas plataformas no resumo (RN-029).
//
// O que NÃO reproduz da planilha (decisões do Danilo):
//   - DV-013 (D13): o total de vendas pagas somava só os públicos quentes.
//     Aqui soma as quatro fontes.
//   - DV-014 (D8): nas combinações 2–5, CPL e leads do Meta frio liam o bloco
//     do Meta QUENTE com a seleção do Google frio. Aqui cada fonte lê o
//     próprio bloco com a própria seleção, nas cinco.
//   - o `IFERROR(…, 0)` da barra: margem negativa dá atingimento negativo.
//   - DV-008, como nos orgânicos: sem nível → `null`, não `#N/A`.
// E o que reproduz: seleção vazia = 0; remarketing só informativo (D14).

/** As quatro fontes, na ordem da planilha — cópia local da 48.2 (módulo folha). */
const FONTES = ["meta_quente", "meta_frio", "google_quente", "google_frio"] as const satisfies readonly FontePaga[];

/** As oito entradas manuais de um bloco pago (E{r0+3}, F{r0+5}…F{r0+9}, D1, D12), como a API persiste. */
export const CAMPOS_DO_BLOCO_PAGO = [
  "pctCaptacao",
  "conversaoMedia",
  "variacaoConversao",
  "variacaoReceita",
  "cplMedioHistorico",
  "faixaVariacao",
  "fracaoCenario1",
  "nivelAssumido",
] as const;
export type CampoDoBlocoPago = (typeof CAMPOS_DO_BLOCO_PAGO)[number];
/** Frações como decimal; `cplMedioHistorico` em reais; `nivelAssumido` inteiro 1…10; vazio = `null`. */
export type BlocoPago = Record<CampoDoBlocoPago, number | null>;

export type SelecoesPorFonte = Record<FontePaga, Selecao>;

export interface CombinacaoPagaPersistida {
  indice: number;
  selecoes: SelecoesPorFonte;
}

/** O que a API guarda e devolve para a aba 3: só entradas (E5). */
export interface PagosDoSimulador {
  blocos: Record<FontePaga, BlocoPago>;
  combinacoes: CombinacaoPagaPersistida[];
}

export function blocoPagoVazio(): BlocoPago {
  const b = {} as BlocoPago;
  for (const k of CAMPOS_DO_BLOCO_PAGO) b[k] = null;
  return b;
}

export function selecoesPagasVazias(): SelecoesPorFonte {
  const s = {} as SelecoesPorFonte;
  for (const f of FONTES) s[f] = null;
  return s;
}

/** Quatro blocos vazios e cinco combinações vazias — a forma fixa da tela (PO-02). */
export function pagosVazios(): PagosDoSimulador {
  const blocos = {} as Record<FontePaga, BlocoPago>;
  for (const f of FONTES) blocos[f] = blocoPagoVazio();
  return {
    blocos,
    combinacoes: INDICES_DAS_COMBINACOES.map((indice) => ({ indice, selecoes: selecoesPagasVazias() })),
  };
}

// ------------------------------------------------------------------
// PO-01 — ponte entre a taxonomia canônica (48.2) e a derivação da 48.1
// ------------------------------------------------------------------

/** Fonte canônica → campos da derivação da 48.1: receita necessária (D5) e verba (RN-006). */
export const FONTE_NA_ABA_1: Record<FontePaga, { receita: keyof DerivadosFinanceiros; verba: keyof DerivadosFinanceiros }> = {
  meta_quente: { receita: "receitaMetaQuente", verba: "investMetaQuente" },
  meta_frio: { receita: "receitaMetaFrio", verba: "investMetaFrio" },
  google_quente: { receita: "receitaGoogleQuente", verba: "investGoogleQuente" },
  google_frio: { receita: "receitaGoogleFrio", verba: "investGoogleFrio" },
};

/** O que a aba 3 importa da aba 1 para uma fonte (F{r0+1}, F{r0+2} e o ticket). */
export interface OrigemDaFonteNaAba1 {
  /** `receita<Fonte>` — `null` quando a margem-alvo dos pagos não tem base. */
  metaReceita: number | null;
  /** `invest<Fonte>` — verba da fonte (reais). */
  verba: number;
  ticketMedio: Entrada;
}

export function origemDaFonteNaAba1(
  entradas: InputsFinanceiros,
  derivados: DerivadosFinanceiros,
  fonte: FontePaga,
): OrigemDaFonteNaAba1 {
  const campos = FONTE_NA_ABA_1[fonte];
  return {
    metaReceita: derivados[campos.receita] as number | null,
    verba: n(derivados[campos.verba] as number),
    ticketMedio: entradas.ticketMedio,
  };
}

/** Bloco persistido + origem da aba 1 → os parâmetros que `gradePaga` (48.2) recebe. */
export function parametrosDoBlocoPago(bloco: BlocoPago, origem: OrigemDaFonteNaAba1): ParametrosPagos {
  return {
    metaReceita: origem.metaReceita,
    verba: origem.verba,
    ticketMedio: origem.ticketMedio,
    pctCaptacao: bloco.pctCaptacao,
    conversaoMedia: bloco.conversaoMedia,
    variacaoConversao: bloco.variacaoConversao,
    variacaoReceita: bloco.variacaoReceita,
    fracaoCenario1: bloco.fracaoCenario1,
    cplMedioHistorico: bloco.cplMedioHistorico,
    faixaVariacao: bloco.faixaVariacao,
  };
}

// ------------------------------------------------------------------
// RN-027 — tráfego (igual nas cinco combinações)
// ------------------------------------------------------------------

export interface Trafego {
  /** Y32, Y33, Y35, Y36 — a verba de cada fonte (aba 1). */
  porFonte: Record<FontePaga, number>;
  /** Y31 — quente + frio do Meta. */
  meta: number;
  /** Y34 — quente + frio do Google. */
  google: number;
  /** Y30 — as quatro. */
  total: number;
  /** Y37 — `total ÷ receitaBruta`; `null` quando a receita bruta é zero. */
  pctDaReceita: number | null;
}

export function trafegoDaCombinacao(verbas: Record<FontePaga, Entrada>, receitaBruta: number): Trafego {
  const porFonte = {} as Record<FontePaga, number>;
  for (const f of FONTES) porFonte[f] = n(verbas[f]);
  const meta = porFonte.meta_quente + porFonte.meta_frio;
  const google = porFonte.google_quente + porFonte.google_frio;
  const total = meta + google;
  return { porFonte, meta, google, total, pctDaReceita: div(total, receitaBruta) };
}

// ------------------------------------------------------------------
// RN-028 / RN-019 — margem de contribuição por plataforma e dos pagos
// ------------------------------------------------------------------

export interface McDaPlataforma {
  receita: number;
  trafego: number;
  /** `mc_fonte` da spec: `tributável − Σ custos × tributável − tráfego`. */
  mc: number;
  /** X40/X41 — `mc ÷ receita`; `null` em receita zero. */
  pct: number | null;
}

/** `mc_fonte(receita, trafego)` da spec §3.2 — a cadeia de deduções da plataforma menos o seu tráfego. */
export function mcDaPlataforma(receita: number, trafego: number, pct: PercentuaisDeCusto): McDaPlataforma {
  const liquida = cadeiaDeDeducoes([receita], pct).mc;
  const mc = liquida - trafego;
  return { receita, trafego, mc, pct: div(mc, receita) };
}

export interface McPorPlataforma {
  meta: McDaPlataforma;
  google: McDaPlataforma;
  /** Y39 — `mc_meta + mc_google` (≡ receita líquida − tráfego total). */
  pagos: number;
  /** Y42 — `pagos ÷ receitaBruta`; `null` em receita zero. */
  pagosPct: number | null;
}

export function mcPorPlataforma(
  receitas: Record<FontePaga, number>,
  trafego: Trafego,
  pct: PercentuaisDeCusto,
  receitaBruta: number,
): McPorPlataforma {
  const meta = mcDaPlataforma(receitas.meta_quente + receitas.meta_frio, trafego.meta, pct);
  const google = mcDaPlataforma(receitas.google_quente + receitas.google_frio, trafego.google, pct);
  const pagos = meta.mc + google.mc;
  return { meta, google, pagos, pagosPct: div(pagos, receitaBruta) };
}

// ------------------------------------------------------------------
// RN-013 / RN-021 / RN-022 / RN-025 / RN-029 — resumo de marketing
// ------------------------------------------------------------------

export interface ResumoDaFonte extends ResumoDoCanal {
  /** Y49 — CPL máximo do produto: `grade.cpl[nivel][sel]` (captação ÷ leads inteiros); `null` sem seleção, sem nível ou sem base (razão, como a conversão). */
  cpl: number | null;
  /** Cadeia bruta (§3.4). */
  cplBruto: number | null;
}

/**
 * Resumo de uma fonte numa combinação — o `resumoDoCanal` dos orgânicos mais
 * o CPL máximo. Cada fonte lê o PRÓPRIO bloco com a PRÓPRIA seleção, nas
 * cinco combinações (D8 — não reproduz DV-014).
 *
 * Sem seleção ou sem nível, o CPL é `null` ("—"): é uma RAZÃO (captação ÷
 * leads), como a conversão — vendas e leads a zero somam nos totais, mas um
 * "CPL de R$ 0,00" leria como lead de graça (REQ-001 do gate).
 */
export function resumoDaFonte(grade: GradePaga, sel: Selecao, nivel: number | null): ResumoDaFonte {
  const base = resumoDoCanal(grade, sel, nivel);
  if (sel === null || sel === undefined || nivel === null || nivel === undefined) {
    return { ...base, cpl: null, cplBruto: null };
  }
  return {
    ...base,
    cpl: grade.cpl[nivel - 1]?.[sel - 1] ?? null,
    cplBruto: grade.cplBruto[nivel - 1]?.[sel - 1] ?? null,
  };
}

export interface ResumoDaPlataforma {
  /** Y47/Y58 — quente + frio. */
  vendas: number | null;
  leads: number | null;
  /** `vendas ÷ leads` da plataforma; `null` sem base. */
  conversao: number | null;
  vendasBruto: number | null;
  leadsBruto: number | null;
  conversaoBruto: number | null;
}

export interface TotaisPagos {
  meta: ResumoDaPlataforma;
  google: ResumoDaPlataforma;
  /** Y46 — as QUATRO fontes (D13 — não reproduz DV-013, que somava só os quentes). */
  vendas: number | null;
  leads: number | null;
  vendasBruto: number | null;
  leadsBruto: number | null;
}

function resumoDaPlataforma(fontes: readonly ResumoDaFonte[]): ResumoDaPlataforma {
  const t = totaisDaCombinacao(fontes);
  return {
    vendas: t.vendas,
    leads: t.leads,
    conversao: div(t.vendas, t.leads),
    vendasBruto: t.vendasBruto,
    leadsBruto: t.leadsBruto,
    conversaoBruto: div(t.vendasBruto, t.leadsBruto),
  };
}

export function totaisPagos(fontes: Record<FontePaga, ResumoDaFonte>): TotaisPagos {
  const meta = resumoDaPlataforma([fontes.meta_quente, fontes.meta_frio]);
  const google = resumoDaPlataforma([fontes.google_quente, fontes.google_frio]);
  const todas = totaisDaCombinacao(FONTES.map((f) => fontes[f]));
  return { meta, google, vendas: todas.vendas, leads: todas.leads, vendasBruto: todas.vendasBruto, leadsBruto: todas.leadsBruto };
}

// ------------------------------------------------------------------
// Uma combinação paga inteira (a coluna Y, AA, … da aba 3)
// ------------------------------------------------------------------

export interface CombinacaoPaga {
  indice: number;
  /** Y12, Y13, Y15, Y16. */
  receitas: Record<FontePaga, number>;
  /** Y11 e Y14. */
  receitaMeta: number;
  receitaGoogle: number;
  /** Y10, Y18, Y20, Y22…Y26 e Y28 — aqui `cadeia.mc` é a RECEITA LÍQUIDA (antes do tráfego). */
  cadeia: CadeiaDeDeducoes;
  receitaLiquida: number;
  trafego: Trafego;
  mc: McPorPlataforma;
  /** Contra `metaMargemPagos` (F14 da 48.1). */
  meta: AtingimentoDaMeta;
  fontes: Record<FontePaga, ResumoDaFonte>;
  totais: TotaisPagos;
}

export function combinacaoPaga(args: {
  indice: number;
  grades: Record<FontePaga, GradePaga>;
  selecoes: SelecoesPorFonte;
  /** `nivelAssumido` de cada bloco. */
  niveis: Record<FontePaga, number | null>;
  percentuais: PercentuaisDeCusto;
  /** `invest<Fonte>` da 48.1 — o tráfego. */
  verbas: Record<FontePaga, Entrada>;
  /** `metaMargemPagos` da 48.1 (F14). */
  metaMargemPagos: Entrada;
}): CombinacaoPaga {
  const receitas = {} as Record<FontePaga, number>;
  const fontes = {} as Record<FontePaga, ResumoDaFonte>;
  for (const f of FONTES) {
    const resumo = resumoDaFonte(args.grades[f], args.selecoes[f], args.niveis[f]);
    fontes[f] = resumo;
    receitas[f] = resumo.receita;
  }
  const receitaMeta = receitas.meta_quente + receitas.meta_frio;
  const receitaGoogle = receitas.google_quente + receitas.google_frio;
  const cadeia = cadeiaDeDeducoes(
    FONTES.map((f) => receitas[f]),
    args.percentuais,
  );
  const trafego = trafegoDaCombinacao(args.verbas, cadeia.receitaBruta);
  const mc = mcPorPlataforma(receitas, trafego, args.percentuais, cadeia.receitaBruta);
  return {
    indice: args.indice,
    receitas,
    receitaMeta,
    receitaGoogle,
    cadeia,
    receitaLiquida: cadeia.mc,
    trafego,
    mc,
    meta: atingimentoDaMeta(mc.pagos, args.metaMargemPagos),
    fontes,
    totais: totaisPagos(fontes),
  };
}

// ==================================================================
// Resumo Final — aba `[4] Resumo Final` (Story 48.5)
// ==================================================================
//
// O Cenário k consolida a Combinação k da aba 2 (`combinacaoOrganica`) com a
// Combinação k da aba 3 (`combinacaoPaga`): soma receitas, deduções e
// margens, lê o tráfego dos pagos, mede o atingimento contra a META TOTAL
// (F13 da 48.1) e junta o resumo de marketing das duas origens. Nada aqui
// refaz uma grade ou uma cadeia (E4): tudo é lido dos dois objetos.
//
// O que NÃO reproduz da planilha (decisões do Danilo):
//   - DV-015 (D9): "Nº de Vendas Google" repetia só o público quente. Aqui
//     Google = quente + frio, como o Meta — e o total de pagos soma as quatro
//     fontes (D13, herdado da 48.4).
//   - DV-008: canal/fonte sem nível dava `#N/A` em cascata até aqui. `null`
//     por LINHA (D3): um canal sem nível anula os leads orgânicos, não os
//     pagos, e vice-versa.
//   - `#DIV/0!` / `#VALUE!` (REPT negativo): denominador zero é `null`;
//     margem negativa é atingimento negativo, número.
// E o que reproduz de propósito: RN-031 — a "receita líquida total" é a MC
// dos orgânicos MAIS a receita líquida dos pagos antes do tráfego (as duas
// parcelas são "depois dos custos variáveis, antes do tráfego"); e o tráfego
// é o mesmo nos cinco cenários.
//
// AR-006/AR-007 viram invariantes (testadas), não regras: os percentuais
// consolidados reproduzem os da aba 1, e os totais lidos das combinações são
// iguais à re-soma por canal/fonte.
//
// DV-017 = A: o rótulo do cenário (META PISO / BOA / SUPER) é anotação
// persistida, sem regra — este módulo só conhece a lista.

/** Lista literal da validação de dados de G6, I6, K6, M6, O6 — constante, não cadastro (E3). */
export const ROTULOS_DO_CENARIO = ["META PISO", "META BOA", "META SUPER"] as const;
export type RotuloDoCenario = (typeof ROTULOS_DO_CENARIO)[number];

export interface CenarioRotulado {
  indice: number;
  rotulo: RotuloDoCenario | null;
}

/** O que a API guarda e devolve para a aba 4: só os rótulos (E5). */
export interface RotulosDoSimulador {
  cenarios: CenarioRotulado[];
}

/** Cinco cenários sem rótulo — a forma fixa da tela. */
export function rotulosVazios(): RotulosDoSimulador {
  return { cenarios: INDICES_DAS_COMBINACOES.map((indice) => ({ indice, rotulo: null })) };
}

export function ehRotuloDoCenario(v: unknown): v is RotuloDoCenario {
  return typeof v === "string" && (ROTULOS_DO_CENARIO as readonly string[]).includes(v);
}

// ------------------------------------------------------------------
// Consolidação
// ------------------------------------------------------------------

export interface ReceitasConsolidadas {
  /** G11 — `o.cadeia.receitaBruta`. */
  organicos: number;
  /** G12 — `p.cadeia.receitaBruta`. */
  pagos: number;
  /** G10. */
  total: number;
}

export interface CadeiaConsolidada {
  /** G14 e F14 (`÷ receita bruta total`). */
  reembolso: number;
  pctReembolso: number | null;
  /** G16. */
  receitaTributavel: number;
  /** G18…G22, cada uma orgânicos + pagos. */
  deducoes: CadeiaDeDeducoes["deducoes"];
  /** F18…F22 — cada dedução `÷ receita tributável`. */
  pctDeducoes: { marketplace: number | null; imposto: number | null; custoProduto: number | null; comissoes: number | null; outros: number | null };
  totalDeducoes: number;
  /** G24 — RN-031: MC dos orgânicos + receita líquida dos pagos (antes do tráfego). */
  receitaLiquidaTotal: number;
}

export interface TrafegoConsolidado extends Trafego {
  /** F26 — `total ÷ receita bruta TOTAL` (o `pctDaReceita` herdado é sobre a receita paga). */
  pctDaReceitaTotal: number | null;
}

export interface McConsolidada {
  /** G35, G36, G34. */
  organicos: number;
  pagos: number;
  total: number;
  /** F35 (`÷ receita orgânica`), F36 (`÷ receita paga`), F34 (`÷ receita bruta total`). */
  pctOrganicos: number | null;
  pctPagos: number | null;
  pctTotal: number | null;
}

export interface MarketingOrganicos {
  /** G40, G56 — lidos de `o.totais` (AR-007: iguais à re-soma por canal). */
  vendas: number | null;
  leads: number | null;
  /** G48 — `vendas ÷ leads` com os inteiros. */
  conversao: number | null;
  vendasBruto: number | null;
  leadsBruto: number | null;
  conversaoBruto: number | null;
  /** G41…G46, G49…G54, G57…G62. */
  canais: Record<CanalOrganico, ResumoDoCanal>;
}

export interface MarketingDaPlataforma extends ResumoDaPlataforma {
  /** G81/G84 — RN-030: tráfego da plataforma ÷ leads da plataforma (inteiros); `null` sem base. */
  cpl: number | null;
  cplBruto: number | null;
}

export interface MarketingPagos {
  /** G64, G88 — as QUATRO fontes (D13). */
  vendas: number | null;
  leads: number | null;
  /** G72. */
  conversao: number | null;
  /** G80 — RN-030: tráfego total ÷ leads pagos (inteiros). */
  cpl: number | null;
  vendasBruto: number | null;
  leadsBruto: number | null;
  conversaoBruto: number | null;
  cplBruto: number | null;
  /** G65/G73/G81/G89 — Meta = quente + frio; G68/G76/G84/G92 — Google = quente + frio (D9). */
  meta: MarketingDaPlataforma;
  google: MarketingDaPlataforma;
  /** G66/G67/G69/G70, G74/G75/G77/G78, G82/G83/G85/G86, G90/G91/G93/G94. */
  fontes: Record<FontePaga, ResumoDaFonte>;
}

export interface ResumoFinal {
  indice: number;
  receitas: ReceitasConsolidadas;
  cadeia: CadeiaConsolidada;
  trafego: TrafegoConsolidado;
  mc: McConsolidada;
  /** Contra `metaMargemTotal` (F13 da 48.1). */
  meta: AtingimentoDaMeta;
  organicos: MarketingOrganicos;
  pagos: MarketingPagos;
}

function marketingDaPlataforma(p: ResumoDaPlataforma, trafego: number): MarketingDaPlataforma {
  return { ...p, cpl: div(trafego, p.leads), cplBruto: div(trafego, p.leadsBruto) };
}

/**
 * Cenário k da aba 4 a partir da Combinação k das abas 2 e 3.
 *
 * `metaMargemTotal` é a ENTRADA F13 da 48.1 (não um derivado). O tráfego é
 * lido de `paga.trafego` e só ganha o percentual sobre a receita bruta total.
 */
export function resumoFinal(args: {
  indice: number;
  organica: CombinacaoOrganica;
  paga: CombinacaoPaga;
  metaMargemTotal: Entrada;
}): ResumoFinal {
  const { organica: o, paga: p } = args;

  // RN-017 — receitas
  const receitas: ReceitasConsolidadas = {
    organicos: o.cadeia.receitaBruta,
    pagos: p.cadeia.receitaBruta,
    total: o.cadeia.receitaBruta + p.cadeia.receitaBruta,
  };

  // RN-018 / RN-031 — cadeia consolidada (cada linha = orgânicos + pagos)
  const reembolso = o.cadeia.reembolso + p.cadeia.reembolso;
  const receitaTributavel = o.cadeia.receitaTributavel + p.cadeia.receitaTributavel;
  const deducoes = {
    marketplace: o.cadeia.deducoes.marketplace + p.cadeia.deducoes.marketplace,
    imposto: o.cadeia.deducoes.imposto + p.cadeia.deducoes.imposto,
    custoProduto: o.cadeia.deducoes.custoProduto + p.cadeia.deducoes.custoProduto,
    comissoes: o.cadeia.deducoes.comissoes + p.cadeia.deducoes.comissoes,
    outros: o.cadeia.deducoes.outros + p.cadeia.deducoes.outros,
  };
  const cadeia: CadeiaConsolidada = {
    reembolso,
    pctReembolso: div(reembolso, receitas.total),
    receitaTributavel,
    deducoes,
    pctDeducoes: {
      marketplace: div(deducoes.marketplace, receitaTributavel),
      imposto: div(deducoes.imposto, receitaTributavel),
      custoProduto: div(deducoes.custoProduto, receitaTributavel),
      comissoes: div(deducoes.comissoes, receitaTributavel),
      outros: div(deducoes.outros, receitaTributavel),
    },
    totalDeducoes: o.cadeia.totalDeducoes + p.cadeia.totalDeducoes,
    // RN-031: MC dos orgânicos (o `mc` da cadeia da aba 2) + receita líquida dos pagos (antes do tráfego)
    receitaLiquidaTotal: o.cadeia.mc + p.receitaLiquida,
  };

  // RN-027 — tráfego (o mesmo nos cinco cenários), % sobre a receita bruta total
  const trafego: TrafegoConsolidado = { ...p.trafego, pctDaReceitaTotal: div(p.trafego.total, receitas.total) };

  // RN-031 / RN-019 — margens
  const mc: McConsolidada = {
    organicos: o.cadeia.mc,
    pagos: p.mc.pagos,
    total: o.cadeia.mc + p.mc.pagos,
    pctOrganicos: div(o.cadeia.mc, receitas.organicos),
    pctPagos: div(p.mc.pagos, receitas.pagos),
    pctTotal: div(o.cadeia.mc + p.mc.pagos, receitas.total),
  };

  // RN-022 / RN-029 — marketing dos orgânicos (totais lidos; AR-007)
  const organicos: MarketingOrganicos = {
    vendas: o.totais.vendas,
    leads: o.totais.leads,
    conversao: div(o.totais.vendas, o.totais.leads),
    vendasBruto: o.totais.vendasBruto,
    leadsBruto: o.totais.leadsBruto,
    conversaoBruto: div(o.totais.vendasBruto, o.totais.leadsBruto),
    canais: o.canais,
  };

  // RN-022 / RN-029 / RN-030 — marketing dos pagos (D9: Google = quente + frio; D13: total = quatro)
  const pagos: MarketingPagos = {
    vendas: p.totais.vendas,
    leads: p.totais.leads,
    conversao: div(p.totais.vendas, p.totais.leads),
    cpl: div(p.trafego.total, p.totais.leads),
    vendasBruto: p.totais.vendasBruto,
    leadsBruto: p.totais.leadsBruto,
    conversaoBruto: div(p.totais.vendasBruto, p.totais.leadsBruto),
    cplBruto: div(p.trafego.total, p.totais.leadsBruto),
    meta: marketingDaPlataforma(p.totais.meta, p.trafego.meta),
    google: marketingDaPlataforma(p.totais.google, p.trafego.google),
    fontes: p.fontes,
  };

  return {
    indice: args.indice,
    receitas,
    cadeia,
    trafego,
    mc,
    meta: atingimentoDaMeta(mc.total, args.metaMargemTotal),
    organicos,
    pagos,
  };
}
