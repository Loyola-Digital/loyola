// ============================================================
// Story 29.49 — regras da classificação de produtos do Perpétuo.
//
// Em `lib/utils` porque é o único diretório que o runner do pacote executa
// (`vitest.config.ts`, `environment: "node"`, sem jsdom). Dentro do diálogo,
// a chave canônica e a contagem por tipo ficariam sem teste — e a chave é
// justamente o que decide se a classificação do gestor "pega" ou não.
// ============================================================

import type { PerpetualProductType } from "@loyola-x/shared";

/**
 * O tipo de quem não foi classificado.
 *
 * `principal` e não `null`: é o que mantém uma planilha já conectada com o
 * comportamento anterior à story, e espelha a regra da Captação Paga, onde o
 * produto não marcado é o de entrada.
 */
export const TIPO_PADRAO: PerpetualProductType = "principal";

/**
 * Chave canônica de produto — a MESMA regra do backend (`productKey` em
 * `perpetual-spreadsheets.ts`) e da 18.51a.
 *
 * Sem ela, "Imersão" e "imersão " viram dois produtos: o gestor classifica um,
 * o outro segue como principal, e o número não fecha sem nada indicando por quê.
 */
export function productKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Resumo do rodapé do diálogo: quantos produtos em cada tipo. */
export function contarPorTipo(
  tipos: Array<PerpetualProductType | undefined>,
): Record<PerpetualProductType, number> {
  const out: Record<PerpetualProductType, number> = { ingresso: 0, principal: 0, order_bump: 0, combo: 0, upsell: 0 };
  for (const t of tipos) out[t ?? TIPO_PADRAO] += 1;
  return out;
}

/**
 * Story 29.53 (AC3) — a legenda da quebra do card de Vendas.
 *
 * Devolve `null` quando não há o que mostrar: sem classificação, ou com tudo
 * caindo em `principal` (que é a ausência de informação, não informação).
 *
 * ⚠️ As fatias contam LINHAS e o valor do card conta COMPRADORES — elas não
 * somam, e o `titulo` existe para dizer isso a quem tentar somar. O order bump
 * chega numa linha própria com o mesmo e-mail da compra principal: 109 + 20 é
 * 129 linhas pagas, não 110 compradores.
 */
export function legendaQuebraPorTipo(
  quebra: { principal: number; order_bump: number; combo?: number; upsell: number } | null | undefined,
  totalVendas: number,
): { texto: string; titulo: string } | null {
  if (!quebra) return null;
  if (quebra.order_bump === 0 && quebra.combo === 0 && quebra.upsell === 0) return null;

  const partes: string[] = [];
  if (quebra.principal > 0) partes.push(`Principal ${quebra.principal}`);
  // Story 18.69 — o combo é venda própria, não um adicional: aparece na quebra
  // com o mesmo peso do principal.
  if ((quebra.combo ?? 0) > 0) partes.push(`Combo ${quebra.combo}`);
  if (quebra.order_bump > 0) partes.push(`Order Bump ${quebra.order_bump}`);
  if (quebra.upsell > 0) partes.push(`Upsell ${quebra.upsell}`);
  if (partes.length === 0) return null;

  const totalLinhas = quebra.principal + quebra.order_bump + quebra.upsell;
  return {
    texto: partes.join(" · "),
    titulo:
      `${totalLinhas} linhas pagas na planilha contra ${totalVendas} compradores únicos. ` +
      "As fatias contam linhas, não pessoas: o order bump vem numa linha própria com o " +
      "mesmo e-mail da compra principal, e por isso as fatias não somam o valor do card.",
  };
}

/**
 * Story 29.74 (AC3/AC4) — a legenda da quebra do card de **Faturamento Bruto**.
 *
 * Irmã de `legendaQuebraPorTipo`, com uma diferença que muda tudo: aqui as
 * fatias **somam** o valor do card, porque valor é aditivo. Lá elas contam
 * linhas e não somam, e o `titulo` avisa. Os dois textos vivem lado a lado
 * nesta tela, então cada um precisa dizer qual é o seu caso — quem lê vai
 * tentar somar as duas.
 *
 * Devolve `null` pelo mesmo critério da irmã: sem nada além de `principal`, a
 * quebra é a ausência de informação disfarçada de informação.
 */
export function legendaFaturamentoPorTipo(
  quebra:
    | { principal: number; order_bump: number; combo?: number; upsell: number }
    | null
    | undefined,
  faturamentoBruto: number,
  fmtMoeda: (v: number) => string,
): { texto: string; titulo: string } | null {
  if (!quebra) return null;
  if (quebra.order_bump === 0 && (quebra.combo ?? 0) === 0 && quebra.upsell === 0) {
    return null;
  }

  const partes: string[] = [];
  if (quebra.principal > 0) partes.push(`Faturamento Principal ${fmtMoeda(quebra.principal)}`);
  // Story 18.69 — combo é venda própria, não adicional: mesmo peso do principal.
  if ((quebra.combo ?? 0) > 0) partes.push(`Faturamento Combo ${fmtMoeda(quebra.combo!)}`);
  if (quebra.order_bump > 0) {
    partes.push(`Faturamento Order Bump ${fmtMoeda(quebra.order_bump)}`);
  }
  if (quebra.upsell > 0) partes.push(`Faturamento Upsell ${fmtMoeda(quebra.upsell)}`);
  if (partes.length === 0) return null;

  return {
    texto: partes.join(" · "),
    titulo:
      "As fatias somam o Faturamento Bruto do card — valor é aditivo, e o order " +
      "bump já está dentro dele: ele chega numa linha própria com o mesmo e-mail " +
      "da compra principal, e a soma por comprador junta as duas. " +
      `Total: ${fmtMoeda(faturamentoBruto)}. ` +
      "⚠️ Não confundir com a quebra do card de Vendas, que conta LINHAS e por " +
      "isso não fecha com o número dele.",
  };
}

/**
 * Separa os nomes por tipo — o que a 29.50 consome para propor as premissas do
 * relatório sem que ninguém redigite nome de produto.
 *
 * Devolve os nomes ORIGINAIS, na ordem recebida (a API já ordena por contagem),
 * porque é a grafia que o gestor reconhece e a que a planilha registra.
 */
export function agruparPorTipo(
  produtos: Array<{ name: string; type: PerpetualProductType }>,
): Record<PerpetualProductType, string[]> {
  const out: Record<PerpetualProductType, string[]> = { ingresso: [], principal: [], order_bump: [], combo: [], upsell: [] };
  for (const p of produtos) out[p.type ?? TIPO_PADRAO].push(p.name);
  return out;
}
