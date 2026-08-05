/**
 * Story 29.39 (QA-01) — conversão entre fração e pontos percentuais na BORDA.
 *
 * O sistema guarda taxas como fração (0.0399) e a tela fala em pontos
 * percentuais (3,99). A multiplicação ingênua vaza representação binária:
 *
 *   0.0399 × 100 = 3.9900000000000007
 *   0.07   × 100 = 7.000000000000001
 *   0.035  × 100 = 3.5000000000000004
 *
 * O @qa mediu o alcance percorrendo o caminho real (pp → fração → `numeric(6,5)`
 * → leitura → × 100): de 2000 taxas entre 0,01% e 20%, **537 exibiam lixo**.
 * Entre elas 7% e 3,99%, que são valores correntes de gateway.
 *
 * O erro numérico é de 1e-16 e não muda cálculo nenhum. O que ele quebra é a
 * confiança: quem abre a tela e lê `7.000000000000001` conclui que o sistema
 * está errado — e não tem como saber que não está.
 *
 * Estas funções existem para que a conversão aconteça em UM lugar. O padrão
 * correto já existia no mesmo componente (campos herdados usavam `.toFixed(2)`)
 * e não havia sido aplicado aos campos editáveis; centralizar evita que a
 * próxima taxa a aparecer repita o descuido.
 */

/**
 * Casas decimais preservadas na ida para pontos percentuais.
 *
 * A coluna mais precisa do sistema é `numeric(6,5)` — 5 casas na fração, que
 * viram 3 em pontos percentuais. `4` dá uma casa de folga sem chegar perto da
 * zona onde o ruído binário aparece (~15 dígitos significativos).
 */
const PP_DECIMALS = 4;

/**
 * Fração → pontos percentuais, para exibir num campo editável.
 *
 * O `Number(...)` depois do `toFixed` remove zeros à direita: sem ele, 0.025
 * viraria "2.5000" e o usuário veria precisão que não pediu.
 */
export function fracaoParaPP(fracao: number): string {
  if (!Number.isFinite(fracao)) return "";
  return String(Number((fracao * 100).toFixed(PP_DECIMALS)));
}

/**
 * Pontos percentuais → fração, para gravar.
 *
 * O mesmo cuidado na volta: `2.9 / 100` dá 0.028999999999999998, que o
 * `numeric(6,5)` até normalizaria — mas o valor trafega pelo zod e pela
 * fórmula antes disso, e `assertRate` compara contra limites exatos.
 */
export function ppParaFracao(pp: number): number {
  if (!Number.isFinite(pp)) return NaN;
  return Number((pp / 100).toFixed(PP_DECIMALS + 2));
}
