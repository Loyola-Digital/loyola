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

export interface BaseDeReferencia {
  /** Nome do funil que serve de base — aparece uma vez, no cabeçalho. */
  nome: string;
  inputs: InputsPersistidos | null;
  organicos: OrganicosDoSimulador | null;
  pagos: PagosDoSimulador | null;
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

/**
 * `"Reembolso"` + `"4,00%"` → `"Reembolso (base: 4,00%)"`.
 *
 * O nome do lançamento fica só no cabeçalho: repeti-lo em 26 rótulos deixaria
 * a coluna ilegível, e "base" já diz de onde vem.
 */
export function rotuloComReferencia(rotulo: string, referencia: string | null): string {
  return referencia === null ? rotulo : `${rotulo} (base: ${referencia})`;
}
