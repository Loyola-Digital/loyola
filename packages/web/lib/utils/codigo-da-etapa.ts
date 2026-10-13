/**
 * O código de match da etapa, do lado do web (migration 0169).
 *
 * Mora em `lib/utils/` porque é o único diretório que o runner de teste do
 * `web` coleta (`vitest.config.ts`) — a mesma razão de `rotulos-de-etapa.ts`.
 * Um teste ao lado do componente nunca rodaria, e a regra do código vazio
 * abaixo é precisamente o tipo de coisa que quebra em silêncio.
 */

/**
 * Os tipos de etapa que se pode CRIAR, na ordem em que a tela os mostra.
 *
 * `lyrio` fica fora de propósito: ele nasce do funil mobile, não da mão de
 * ninguém. Os rótulos de cada um vêm de `rotulos-de-etapa.ts`.
 */
export const TIPOS_CRIAVEIS = [
  "free",
  "paid",
  "application",
  "sales",
  "cpl",
  "event",
  "event_capture",
  "debriefing",
  "mapa",
  "comercial",
] as const;

export type TipoCriavel = (typeof TIPOS_CRIAVEIS)[number];

/**
 * As campanhas cujo nome contém o código. Substring em minúsculas — a mesma
 * regra de `campanhaCasaComAEtapa` na API, senão a conta que a tela mostra
 * mentiria sobre o que vai ser gravado.
 *
 * Código vazio devolve `[]`, não "todas": substring de string vazia é sempre
 * verdadeira, e pré-selecionar o acervo inteiro de campanhas da conta seria bem
 * pior que não pré-selecionar nada.
 */
export function campanhasQueCasam<T extends { name: string }>(
  campanhas: T[],
  codigo: string,
): T[] {
  const chave = codigo.trim().toLowerCase();
  if (!chave) return [];
  return campanhas.filter((c) => c.name.toLowerCase().includes(chave));
}
