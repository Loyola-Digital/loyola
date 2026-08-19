/**
 * Política de frescor do cache público, em UM lugar só.
 *
 * Story 44.8 (QA-448-03): `maxAgeFrom` era privado de
 * `routes/public-funnel-sales.ts`. A rota da cadeia de CAC serve o mesmo dado de
 * venda da mesma etapa e nascia com a política diferente — chamava
 * `getFreshSalesDaily` sem `opts`, caindo no default fixo de 120 s e ignorando
 * `SALES_PUBLIC_MAX_AGE_SEC` e `?fresh=1` em silêncio.
 *
 * Quem ajusta a variável de ambiente veria o efeito numa rota e não na outra,
 * sem nada avisando. É a mesma classe de divergência que a AC2 desta story
 * existe para impedir — só que na política de frescor em vez de no cálculo.
 */

/**
 * `?fresh=1` força o recompute; senão usa o configurado (em segundos).
 *
 * `undefined` deixa o serviço aplicar o próprio default — "não configurado" e
 * "configurado como zero" são coisas diferentes, e `0` significa recomputar
 * sempre.
 */
export function maxAgeFrom(
  fresh: string | undefined,
  configured: number | undefined,
): number | undefined {
  if (fresh === "1" || fresh === "true") return 0;
  return configured != null ? configured * 1000 : undefined;
}
