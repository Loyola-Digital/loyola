/**
 * Story 18.71: o `utm_content` efetivo de uma célula de planilha.
 *
 * A definição vive em `@loyola-x/shared/src/utm-value` porque o frontend precisa
 * da mesma regra — a tabela "Leads & vendas por UTM" agrupa no browser. Este
 * arquivo é reexport, para os call sites da API importarem de `../utils/`.
 *
 * Import **bare**, não o subpath que o web usa: o `tsc` não reescreve
 * especificadores, então o subpath sairia no `dist/` apontando para um `.ts` que
 * o Node não carrega. Ver a tabela em `packages/shared/src/index.ts`.
 */
export { utmContentEfetivo, normalizeNumericId } from "@loyola-x/shared";
