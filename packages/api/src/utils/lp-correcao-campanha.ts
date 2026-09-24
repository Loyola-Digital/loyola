/**
 * Story 18.83 (AC5) — a correção manual por campanha, nas duas primeiras das
 * três camadas que travam um valor novo (zod → normalização → `$type`).
 *
 * Parar em qualquer uma delas dá 400 ou perda silenciosa, então as duas vivem
 * aqui, fora do handler, com teste. A terceira é o `$type` da coluna
 * `lp_campaign_urls` em `schema.ts`.
 */

import { z } from "zod";

/**
 * Chave = `campaign_id` da Meta (só dígitos, até 64 — o tamanho de
 * `campaign_id` nas tabelas de insights). Valor = URL http(s) ou `""`, que
 * remove a correção (mesma convenção do `lpLinks`, 18.56).
 */
export const correcoesPorCampanhaSchema = z.record(
  z.string().trim().regex(/^\d{1,64}$/, "campaign_id inválido"),
  z.union([
    z.literal(""),
    z.string().trim().max(2048).url().regex(/^https?:\/\//i, "URL deve usar http:// ou https://"),
  ]),
);

/**
 * O objeto substitui o anterior por inteiro (o web manda o mapa completo, com
 * merge por chave). Valor vazio = remoção: apagar a correção devolve o gasto
 * para "Sem link resolvido".
 */
export function normalizarCorrecoesPorCampanha(
  entrada: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [campanha, url] of Object.entries(entrada)) {
    const chave = campanha.trim();
    const valor = url.trim();
    if (chave && valor) out[chave] = valor;
  }
  return out;
}
