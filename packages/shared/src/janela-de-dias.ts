/**
 * Story 18.80 — a régua de janela por dias, em UM lugar só.
 *
 * ## Por que isto saiu do pacote `api`
 *
 * `inicioDaJanela` nasceu na Story 44.27, em `api/src/utils/sale-date.ts`, e
 * corrigiu cinco pontos de corte do perpétuo. Mas o **front tinha a sua própria
 * versão da mesma regra** — e ela estava errada:
 *
 * ```
 * API   traffic-analytics.ts:1191    hoje − (days − 1)    →  N dias   ✅
 * front spreadsheet-filters.ts:40    hoje − days           →  N+1 dias ❌
 * ```
 *
 * Os dois cruzam na mesma conta. CPL, CAC, ROAS e o Top Criativos dividiam
 * leads e vendas de N+1 dias por investimento de N. **O erro tinha direção:
 * sempre otimista.** Medido em 08/09/2026, antes da correção: o CPL do
 * `bbe-fc1-a1-mai-26` em 7 dias saía 50% mais barato que o real.
 *
 * Duas implementações da mesma regra divergem na primeira mudança — foi o que
 * aconteceu. Por isso a função virou módulo compartilhado em vez de ser
 * consertada de novo nos dois lados.
 *
 * ## Módulo folha, sem imports
 *
 * O web consome por subpath (`@loyola-x/shared/src/janela-de-dias`) e a API por
 * bare import. Os dois caminhos NÃO são intercambiáveis, e trocar derruba o
 * boot sem que `tsc`, `vitest` ou `next build` acusem (Story 19.14). Ver a
 * tabela em `./index.ts`.
 *
 * ## `ate` é OBRIGATÓRIO, e é de propósito
 *
 * "Hoje" não é a mesma coisa nos dois lados: a API usa o dia do fuso do negócio
 * (`businessToday()`), o navegador usa o dia local de quem está olhando.
 * Embutir um default aqui esconderia essa diferença dentro da função que existe
 * justamente para acabar com divergência de janela.
 */

/**
 * Soma (ou subtrai) dias de uma data `YYYY-MM-DD`, devolvendo `YYYY-MM-DD`.
 *
 * UTC aqui é só aritmética de calendário: entra e sai como dia civil, sem
 * envolver o fuso do processo em momento nenhum.
 */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * O primeiro dia de uma janela de `dias` que **termina em `ate`, inclusive**.
 *
 * ⚠️ `-(dias − 1)` e não `-dias`. Sete dias contados até hoje são hoje e os
 * seis anteriores — uma janela de N dias terminando hoje **inclui hoje**.
 *
 * `dias <= 0` é tratado como 1: devolver uma data no futuro faria qualquer
 * filtro devolver vazio, e vazio silencioso é pior que uma janela mínima.
 */
export function inicioDaJanela(dias: number, ate: string): string {
  return shiftDayKey(ate, -(Math.max(1, dias) - 1));
}
