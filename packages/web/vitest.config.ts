import path from "node:path";
import react from "@vitejs/plugin-react";
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
 * ABERTA UMA EXCEÇÃO em `components/instagram`: o seletor de período derrubou a
 * tela em produção (16/09/2026) com "`SelectLabel` must be used within
 * `SelectGroup`" — erro que só existe quando o menu ABRE, e que nem tsc nem
 * lint pegam. Cada arquivo dessa pasta declara `@vitest-environment jsdom` no
 * topo, então o resto da suíte segue em `node`.
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
  // Sem isto, um `.test.tsx` morre em "Unexpected JSX expression": o runner não
  // herda o transform de JSX do Next.
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    // `lib/bi` entra junto pelo mesmo motivo de `lib/utils`: é lógica pura
    // (aritmética de grade, máquina de estados de salvamento) e roda sem DOM.
    include: [
      "lib/utils/**/*.test.ts",
      "lib/bi/**/*.test.ts",
      "lib/swipe/**/*.test.ts",
      "lib/planner/**/*.test.ts",
      "components/instagram/**/*.test.tsx",
    ],
    /**
     * Story 18.80 (gate do @qa) — o fuso do runner é FIXADO no do usuário.
     *
     * Sem isto a suíte protegia menos em CI do que na máquina do time. Medido:
     * reintroduzir `.toISOString()` no fim da janela de
     * `spreadsheet-filters.ts` derrubava **8 testes em America/Sao_Paulo e
     * ZERO em UTC** — e o GitHub Actions roda em UTC.
     *
     * Ou seja: o defeito subiria com o CI verde, e só quem rodasse local veria
     * vermelho. Uma proteção que não existe no lugar onde é consultada.
     *
     * `America/Sao_Paulo` e não UTC porque é onde o navegador do usuário está,
     * e o código lê `new Date()` do navegador. Testar no fuso de produção é o
     * que faz o teste falar do produto.
     */
    env: { TZ: "America/Sao_Paulo" },
    // Só remendos do jsdom (ver o arquivo). Em `node` não faz nada.
    setupFiles: ["./vitest.setup.ts"],
  },
});
