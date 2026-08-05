import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Story 29.35 — primeiro runner de teste do `packages/web`.
 *
 * O pacote acumulou 10 arquivos `.test.ts(x)` que NUNCA rodaram: foram escritos
 * ao longo de várias stories sem que existisse runner. Ligar todos de uma vez
 * transformaria esta story numa força-tarefa de correção de testes alheios.
 *
 * `include` cobre só `lib/utils` porque:
 *   - é onde vive a lógica pura (aritmética, derivações, agrupamento) — o que
 *     de fato precisa de teste;
 *   - não exige DOM, então dispensa jsdom e @testing-library;
 *   - é onde estão os follow-ups abertos pelo QA nas 29.33 e 29.34.
 *
 * Os `.test.tsx` de componente seguem fora, e isso é DELIBERADO — não um
 * esquecimento. Ligá-los exige jsdom + testing-library e vale uma story própria.
 *
 * `environment: node` e `globals: true` espelham `packages/api/vitest.config.ts`
 * para que os dois pacotes se comportem igual.
 */
export default defineConfig({
  // O código do pacote importa por `@/...` (alias do tsconfig do Next). O
  // vitest não lê paths do tsconfig, então sem isto qualquer teste que toque
  // um módulo com import absoluto falha ao CARREGAR — não por assertion.
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["lib/utils/**/*.test.ts"],
  },
});
