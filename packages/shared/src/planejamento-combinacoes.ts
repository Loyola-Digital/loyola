/**
 * Combinações de cenários dos canais orgânicos — a região direita (U:AG) da
 * aba `[2] Leads Orgânicos` da planilha (Story 48.3).
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

import type { CanalOrganico, Entrada, GradeOrganica, ParametrosOrganicos } from "./planejamento-cenarios.js";
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
export function resumoDoCanal(grade: GradeOrganica, sel: Selecao, nivel: number | null): ResumoDoCanal {
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
