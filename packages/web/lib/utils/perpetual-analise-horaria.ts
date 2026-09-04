/**
 * Regras da seção "Análise detalhada no período" do Perpétuo (29.70/29.71/29.72).
 *
 * Vive fora do componente para poder ser testada: o runner do `packages/web`
 * cobre `lib/utils`, e os `.test.tsx` de componente seguem fora de propósito.
 */

/** As três linhas de painéis. Cada uma muda a série, não a forma. */
export type LinhaDaAnalise = "faturamento" | "investimento" | "margem";

/**
 * Piso de cobertura abaixo do qual o painel por hora NÃO é desenhado.
 *
 * Medido em produção (2026-09-04): `fz-a1` tem 5% das vendas com hora e `pps1`
 * tem 30% — a mesma coluna de data, formatos diferentes linha a linha. Com 5%,
 * o painel por hora mostraria R$ 4.720 ao lado de um painel de dia da semana
 * com R$ 90.974 do mesmo período, e quem olha os dois conclui que um está
 * quebrado.
 *
 * 50% é o ponto em que a leitura "esta é a melhor hora do funil" ainda tem
 * chance de ser verdadeira. Abaixo disso a tela mostra o motivo em vez do
 * gráfico — meio gráfico apresentado como inteiro é pior que nenhum.
 */
export const PISO_DE_COBERTURA_HORARIA = 50;

export interface CoberturaDaAnalise {
  totalVendas: number;
  vendasComHora: number;
  faturamentoComHora: number;
  faturamentoTotal: number;
  /** Inteiro de 0 a 100. `0` quando não há venda nenhuma no período. */
  percentual: number;
  abaixoDoPiso: boolean;
}

/**
 * Deriva a cobertura exibível a partir do que a rota devolve.
 *
 * O percentual é de VENDAS, não de faturamento: é a unidade em que o gestor lê
 * "quantas das minhas vendas estão neste gráfico". O faturamento entra junto
 * porque uma venda grande fora do corte muda a leitura do painel mais do que
 * dez pequenas.
 */
export function coberturaDeHora(c: {
  totalVendas: number;
  vendasComHora: number;
  faturamentoComHora: number;
  faturamentoSemHora: number;
}): CoberturaDaAnalise {
  const percentual =
    c.totalVendas > 0 ? Math.round((c.vendasComHora / c.totalVendas) * 100) : 0;
  return {
    totalVendas: c.totalVendas,
    vendasComHora: c.vendasComHora,
    faturamentoComHora: c.faturamentoComHora,
    faturamentoTotal: c.faturamentoComHora + c.faturamentoSemHora,
    percentual,
    // Sem venda nenhuma no período não é "cobertura baixa": é período vazio, e
    // quem trata disso é o estado vazio do painel, com outra mensagem.
    abaixoDoPiso: c.totalVendas > 0 && percentual < PISO_DE_COBERTURA_HORARIA,
  };
}

/** `0` → `"00h"`. Duas casas para o eixo não desalinhar entre 9h e 10h. */
export function rotuloDaHora(hora: number): string {
  return `${String(hora).padStart(2, "0")}h`;
}
