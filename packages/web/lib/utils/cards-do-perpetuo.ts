/**
 * Story 29.75 — as três regras dos cards AOV e Order Bump do Perpétuo.
 *
 * Vivem aqui, e não dentro do componente, porque `lib/utils` é o único
 * diretório que o runner do pacote executa (`vitest.config.ts`) — dentro do
 * `.tsx` elas não teriam teste, e é justamente aqui que o erro custa caro: a
 * story nasceu de dois números divergentes na mesma tela.
 *
 * ## O problema que elas resolvem
 *
 * O Perpétuo conta vendas em TRÊS unidades, todas saídas do mesmo laço da rota
 * (medido em produção no `bbe-fc1-a1-mai-26`, 07/09):
 *
 * | Unidade | Como se conta | Medido |
 * |---|---|---|
 * | COMPRADORES | dedup por e-mail (`chaveDeComprador`) | 153 |
 * | LINHAS | uma por linha paga da planilha | principal 153 · bump 41 |
 * | CHECKOUTS | e-mail + data + transação (`agruparEmCheckouts`) | captação 149 · com bump 35 |
 *
 * O resumo mostra as duas primeiras; os cards mostravam a terceira. Decisão do
 * gestor (2026-09-07): **o resumo é a verdade**, e os cards passam a lê-lo.
 */

/** O que o card exibe, e por qual régua. */
export interface LeituraDoCard {
  /** Fração (0-1), ou `null` quando não há base para afirmar. */
  taxa: number | null;
  /**
   * `true` quando os números do resumo estavam disponíveis. `false` significa
   * que a API não classifica produto neste funil — o card volta à leitura por
   * checkout, que é menos comparável mas continua verdadeira.
   */
  usaResumo: boolean;
}

/**
 * AC2 — adesão de order bump: PEDIDOS de bump ÷ vendas do resumo.
 *
 * ⚠️ `bumpsDoResumo` conta LINHAS. Quem levou dois bumps conta duas vezes, e é
 * por isso que a taxa pode passar de 100% — decisão consciente do gestor, que
 * escolheu bater com o resumo em vez de contar pessoas. O rótulo do card diz
 * "order bumps em N vendas", nunca "compradores".
 */
export function adesaoDeBump(
  bumpsDoResumo: number | null | undefined,
  vendasDoResumo: number | null | undefined,
  taxaPorCheckout: number | null,
): LeituraDoCard {
  if (
    bumpsDoResumo == null ||
    vendasDoResumo == null ||
    !Number.isFinite(bumpsDoResumo) ||
    !Number.isFinite(vendasDoResumo) ||
    vendasDoResumo <= 0
  ) {
    return { taxa: taxaPorCheckout, usaResumo: false };
  }
  return { taxa: bumpsDoResumo / vendasDoResumo, usaResumo: true };
}

/**
 * AC3 — representatividade: TODO o order bump ÷ faturamento bruto.
 *
 * A venda avulsa (de quem só levou bump, sem produto principal) passa a
 * **compor** o numerador. Antes ela aparecia como linha à parte e ficava fora
 * da taxa.
 *
 * O denominador acompanha: manter a "receita da captação", que não inclui o
 * avulso, com um numerador que passou a incluí-lo daria uma razão entre
 * grandezas diferentes.
 */
export function representatividadeDeBump(
  bumpAcessorio: number,
  bumpAvulso: number,
  faturamentoBruto: number | null | undefined,
  faturamentoDaEtapa: number,
): { total: number; taxa: number | null; base: number } {
  const total = bumpAcessorio + bumpAvulso;
  const base =
    faturamentoBruto != null && Number.isFinite(faturamentoBruto) && faturamentoBruto > 0
      ? faturamentoBruto
      : faturamentoDaEtapa;
  return { total, taxa: base > 0 ? total / base : null, base };
}

/**
 * AC4 — AOV: faturamento bruto ÷ vendas do resumo.
 *
 * Os dois números são os mesmos dos cards Faturamento Bruto e Vendas, no topo.
 * Antes o AOV tinha base própria (receita da captação ÷ checkouts) e não
 * fechava com nenhum outro número da tela.
 */
export function aovDoPerpetuo(
  faturamentoBruto: number | null | undefined,
  vendasDoResumo: number | null | undefined,
  aovPorCheckout: number | null,
): { valor: number | null; usaResumo: boolean } {
  if (
    faturamentoBruto == null ||
    vendasDoResumo == null ||
    !Number.isFinite(faturamentoBruto) ||
    !Number.isFinite(vendasDoResumo) ||
    vendasDoResumo <= 0
  ) {
    return { valor: aovPorCheckout, usaResumo: false };
  }
  return { valor: faturamentoBruto / vendasDoResumo, usaResumo: true };
}
