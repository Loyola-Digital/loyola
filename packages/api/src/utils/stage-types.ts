/**
 * Grupos de tipos de etapa que se comportam igual.
 *
 * Story 19.14: a definição saiu daqui para `@loyola-x/shared/src/stage-types`,
 * porque o frontend precisava da mesma regra e estava reimplementando-a como
 * `stageType === "paid"` literal em 28 pontos — o que apagava metade do
 * dashboard das etapas `event_capture`.
 *
 * Este arquivo continua existindo como reexport para não mexer nos 5 pontos de
 * import da API. A fonte da verdade é o módulo do `shared`.
 */
/**
 * Import **bare**, não o subpath `@loyola-x/shared/src/stage-types` que o web
 * usa: o `tsc` não reescreve especificadores, então o subpath sairia no `dist/`
 * apontando para um `.ts` que o Node não carrega. O bare resolve por `main` →
 * `dist/index.js`. Ver a tabela em `packages/shared/src/index.ts`.
 */
export {
  ehCaptacaoPaga,
  temDashboardDeVendas,
  ehEtapaDeCaptacao,
} from "@loyola-x/shared";
