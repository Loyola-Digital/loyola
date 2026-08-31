/**
 * Hot/Cold no Perpétuo — a partir do que já está classificado.
 *
 * ## Por que não há regra nova aqui
 *
 * O Perpétuo **já** separa quente de frio: `classificarPublicoDaVenda`, no
 * backend, lê o `utm_term` e devolve `Pago quente` / `Pago frio`, e é essa
 * classificação que alimenta a tabela de order bump e AOV por público.
 *
 * Reclassificar aqui criaria duas definições de "quente" no mesmo dashboard —
 * e no dia em que a do backend mudasse, a tela mostraria dois números
 * diferentes para a mesma pergunta. Este arquivo só **traduz de forma**: pega
 * os cinco baldes do Perpétuo e os projeta nos três do donut.
 *
 * ## Onde os baldes não coincidem
 *
 * O donut tem `hot`, `cold` e `outros`. O Perpétuo tem cinco públicos. A
 * projeção junta em `outros` o que não é quente nem frio — orgânico, pago sem
 * temperatura e sem rastreio —, e é por isso que a legenda de `outros` no
 * Perpétuo carrega o nome de cada balde: "Outros" sozinho esconderia que ali
 * dentro mora o público de maior AOV medido no funil do Netão.
 */

import type { HotColdAggregate } from "@/lib/utils/funnel-metrics";

/** O que a API devolve por público, reduzido ao que este arquivo usa. */
export interface PublicoDoPerpetuo {
  publico: "Orgânico" | "Pago quente" | "Pago frio" | "Pago indefinido" | "Sem Track";
  compradores: number;
  receitaPrincipal: number;
  receitaBump: number;
  receitaUpsell: number;
  aovComBump: number | null;
}

/** A receita total do público — principal + bump + upsell. */
export function receitaDoPublico(p: PublicoDoPerpetuo): number {
  return p.receitaPrincipal + p.receitaBump + p.receitaUpsell;
}

/**
 * Projeta os cinco públicos nos três baldes do donut.
 *
 * `items` recebe o nome do balde de origem com a contagem, e não uma lista de
 * pessoas: aqui a pergunta é "de que é feito o 'Outros'", não "quem comprou".
 */
export function agregarCompradores(publicos: PublicoDoPerpetuo[]): HotColdAggregate | null {
  if (!publicos.length) return null;

  const agg: HotColdAggregate = {
    hot: 0,
    cold: 0,
    outros: 0,
    total: 0,
    items: { hot: [], cold: [], outros: [] },
  };

  for (const p of publicos) {
    if (p.compradores <= 0) continue;
    const rotulo = `${p.publico} (${p.compradores.toLocaleString("pt-BR")})`;
    if (p.publico === "Pago quente") {
      agg.hot += p.compradores;
      agg.items.hot.push(rotulo);
    } else if (p.publico === "Pago frio") {
      agg.cold += p.compradores;
      agg.items.cold.push(rotulo);
    } else {
      agg.outros += p.compradores;
      agg.items.outros.push(rotulo);
    }
    agg.total += p.compradores;
  }

  // Zero compradores em todos os baldes é "ainda não vendeu", não uma
  // distribuição de zeros — e um donut vazio afirma o que não foi medido.
  return agg.total > 0 ? agg : null;
}

/** O mesmo, por RECEITA: quem traz mais gente nem sempre traz mais dinheiro. */
export function agregarReceita(publicos: PublicoDoPerpetuo[]): HotColdAggregate | null {
  if (!publicos.length) return null;

  const agg: HotColdAggregate = {
    hot: 0,
    cold: 0,
    outros: 0,
    total: 0,
    items: { hot: [], cold: [], outros: [] },
  };

  const emReais = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  for (const p of publicos) {
    const receita = receitaDoPublico(p);
    if (receita <= 0) continue;
    const rotulo = `${p.publico} (${emReais(receita)})`;
    if (p.publico === "Pago quente") {
      agg.hot += receita;
      agg.items.hot.push(rotulo);
    } else if (p.publico === "Pago frio") {
      agg.cold += receita;
      agg.items.cold.push(rotulo);
    } else {
      agg.outros += receita;
      agg.items.outros.push(rotulo);
    }
    agg.total += receita;
  }

  return agg.total > 0 ? agg : null;
}

/**
 * Quantos públicos pagos têm temperatura declarada.
 *
 * Serve para a tela saber se vale mostrar o donut: um funil onde ninguém
 * preencheu `utm_term` teria 100% em "Outros", o que não é informação — é a
 * ausência dela, e a tela precisa dizer isso com palavras.
 */
export function temTemperatura(publicos: PublicoDoPerpetuo[]): boolean {
  return publicos.some(
    (p) => (p.publico === "Pago quente" || p.publico === "Pago frio") && p.compradores > 0,
  );
}
