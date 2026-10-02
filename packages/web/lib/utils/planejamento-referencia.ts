// Story 48.9 — o valor do lançamento anterior mostrado ao lado do rótulo.
//
// O pedido do Danilo (22/09): "termos um parâmetro com dados existentes para
// nos dar base para preencher os dados do novo lançamento… ao lado do título
// entre ()". Decisões dele: base = lançamento anterior do MESMO expert e MESMO
// tipo; exibição entre parênteses ao lado do rótulo.
//
// Este módulo só FORMATA — quem escolhe a base é a página, e os valores vêm
// das mesmas rotas que a aba usa (o simulador do outro funil). Nada aqui
// preenche campo: a referência é para ler, não para sobrescrever o que o
// usuário digitou.

import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";
import { TIPO_DO_CAMPO, type CampoDosInputs, type InputsPersistidos } from "@/lib/utils/planejamento-inputs-form";
import type { CanalOrganico, FontePaga } from "@loyola-x/shared/src/planejamento-cenarios";
import type { OrganicosDoSimulador, PagosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";
// Story 48.13 — módulo FOLHA do shared, por subpath: import de VALOR do barrel
// quebra o `next build`.
import { rotuloDoTipoDeLancamento, type TipoDeLancamento } from "@loyola-x/shared/src/planejamento-lancamentos";

export interface BaseDeReferencia {
  /** Nome do funil que serve de base. Story 48.14: identifica o grupo dela em cada rótulo (`dg-pg04 real: …`). */
  nome: string;
  inputs: InputsPersistidos | null;
  organicos: OrganicosDoSimulador | null;
  pagos: PagosDoSimulador | null;
  /**
   * Story 48.13 — a base não tem Planejamento salvo: nenhum `base:` aparece
   * (as três leituras ficam `null`) e só o `real:` dela é mostrado. A
   * referência continua EXISTINDO — com `null` a tela voltaria a pedir
   * "Escolha um lançamento anterior…" com uma base já escolhida (PO-06).
   */
  semSimulador?: boolean;
}

/** Fração → "4,00%"; moeda → "R$ 1.200,00"; contagem → "25.000". Vazio e `NaN` → `null` (não mostra referência). */
export function textoDeReferencia(valor: number | null | undefined, tipo: "pct" | "moeda" | "contagem"): string | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  if (tipo === "pct") return fmtPercent(valor * 100);
  if (tipo === "moeda") return fmtCurrency(valor);
  return fmtInt(valor);
}

/** Referência de um dos 26 campos da aba 1. `null` quando não há base ou o campo está vazio nela. */
export function referenciaDoInput(base: BaseDeReferencia | null, campo: CampoDosInputs): string | null {
  if (!base?.inputs) return null;
  return textoDeReferencia(base.inputs[campo], TIPO_DO_CAMPO[campo]);
}

/** Referência da "Conversão média em vendas" de um canal orgânico (aba 2). */
export function referenciaDaConversaoOrganica(base: BaseDeReferencia | null, canal: CanalOrganico): string | null {
  if (!base?.organicos) return null;
  return textoDeReferencia(base.organicos.blocos[canal]?.conversaoMedia, "pct");
}

/** Referência da "Conversão média em vendas" de uma fonte paga (aba 3). */
export function referenciaDaConversaoPaga(base: BaseDeReferencia | null, fonte: FontePaga): string | null {
  if (!base?.pagos) return null;
  return textoDeReferencia(base.pagos.blocos[fonte]?.conversaoMedia, "pct");
}

// Story 48.14 — o rótulo deixou de ser montado aqui. `rotuloComReferencia`
// (`"Reembolso (base: 4,00%)"`, uma base só e sem o nome dela) foi trocada por
// `rotuloComBases` em `planejamento-bases.ts`, que recebe a LISTA de bases
// marcadas e identifica cada grupo pelo nome do funil.

// ---- Story 48.13 — base SEM Planejamento: só o realizado ----
//
// Decisão 2.3 = B do Danilo (23/09): um lançamento anterior do mesmo tipo sem
// simulador salvo passa a ser oferecido como base, e a tela mostra só o
// `real:` dele — "Preciso ter esse histórico real para poder planejar o M3".
//
// O risco que estas funções fecham: um simulador que não existe não pode virar
// referência. As rotas devolvem `inputsVazios()` para quem não tem simulador e
// o padrão de custos da 48.8 vive no formulário; nada disso pode aparecer como
// `base:` ao lado de um campo.

/**
 * A base tem simulador salvo? `temSimulador` ausente = API antiga, que só
 * devolvia bases com simulador — então "sim", exatamente como antes (AC7).
 */
export function baseTemSimulador(base: { temSimulador?: boolean }): boolean {
  return base.temSimulador !== false;
}

/**
 * A referência da base escolhida (AC5/AC6).
 *
 * - Nenhuma base escolhida → `null`.
 * - Base SEM simulador → a referência existe, com as três leituras `null` e
 *   `semSimulador: true`: nenhum `base:` em campo nenhum, mesmo que as
 *   leituras tenham chegado com valores.
 * - Base com simulador (ou API antiga) → as leituras, como na 48.9.
 */
export function montarReferencia(
  base: { nome: string; temSimulador?: boolean } | null,
  leituras: { inputs: InputsPersistidos | null; organicos: OrganicosDoSimulador | null; pagos: PagosDoSimulador | null },
): BaseDeReferencia | null {
  if (!base) return null;
  if (!baseTemSimulador(base)) {
    return { nome: base.nome, inputs: null, organicos: null, pagos: null, semSimulador: true };
  }
  return { nome: base.nome, inputs: leituras.inputs, organicos: leituras.organicos, pagos: leituras.pagos };
}

/** Opção do seletor (AC4): `"fz-m2-jul26 · meteórico · só realizado"` quando não há simulador. */
export function rotuloDaOpcaoDeBase(base: { nome: string; rotuloDoTipo: string; temSimulador?: boolean }): string {
  const partes = [base.nome, base.rotuloDoTipo];
  if (!baseTemSimulador(base)) partes.push("só realizado");
  return partes.join(" · ");
}

/**
 * A frase quando não há base, pelo MOTIVO (AC3/AC7).
 *
 * - `tipo === null` → o nome do funil não identifica o tipo.
 * - API nova (`incluiSemSimulador`) e nenhum anterior → é o primeiro do tipo.
 *   O rótulo do shared já diz "lançamento" ("lançamento gratuito"): a frase é
 *   "o primeiro {rótulo}", nunca "o primeiro lançamento {rótulo}" (PO-02).
 * - API antiga (sem o sinal) → a frase de hoje. A API antiga filtra os
 *   anteriores sem simulador: para o fz-m3 ela devolve lista vazia, e "primeiro
 *   meteórico deste expert" seria FALSO — existem fz-m1 e fz-m2 (PO-03).
 */
export function fraseSemBase(resposta: { tipo: TipoDeLancamento | null; incluiSemSimulador?: boolean }): string {
  if (resposta.tipo === null) {
    return "Sem histórico anterior — o nome deste funil não identifica o tipo de lançamento (pago, gratuito, meteórico ou presencial).";
  }
  if (resposta.incluiSemSimulador === true) {
    return `Sem histórico anterior — este é o primeiro ${rotuloDoTipoDeLancamento(resposta.tipo)} deste expert.`;
  }
  return "Sem histórico anterior — nenhum lançamento anterior do mesmo tipo tem o Planejamento preenchido.";
}

/**
 * A linha ao lado do seletor, conforme as bases marcadas.
 *
 * Story 48.14 (AC4, PO-01) — com várias bases marcadas, o texto fala de várias
 * e diz que cada valor vem com o nome do lançamento; continua pedindo
 * "Escolha…" só quando NENHUMA está marcada. A frase da base sem Planejamento
 * (48.13 AC5) saiu daqui e foi para a linha da própria base, na declaração do
 * realizado — com duas bases, uma com e outra sem simulador, uma frase única
 * aqui seria falsa para uma delas.
 *
 * DOC-001 (gate da 48.14): "ao lado dos campos que eles cobrem", não "de cada
 * campo" — o realizado cobre 4 dos 26 campos da aba 1, a conversão por canal
 * e os dois cartões quente/frio.
 */
export function textoDoCabecalhoDasBases(referencias: readonly BaseDeReferencia[]): string {
  if (referencias.length === 0) {
    return "Escolha um ou mais lançamentos anteriores do mesmo tipo para ver os valores deles ao lado de cada campo.";
  }
  return "Os valores dos lançamentos marcados aparecem entre parênteses ao lado dos campos que eles cobrem, cada um com o nome dele — só como parâmetro; nada é preenchido nem salvo.";
}
