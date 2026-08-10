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
  const out: Record<PerpetualProductType, number> = { principal: 0, order_bump: 0, upsell: 0 };
  for (const t of tipos) out[t ?? TIPO_PADRAO] += 1;
  return out;
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
  const out: Record<PerpetualProductType, string[]> = { principal: [], order_bump: [], upsell: [] };
  for (const p of produtos) out[p.type ?? TIPO_PADRAO].push(p.name);
  return out;
}
