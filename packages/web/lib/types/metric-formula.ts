/**
 * Memorial de cálculo de uma métrica — estrutura compartilhada usada por
 * `<MetricWithTooltip>` (KPI cards) e `<FormulaChartTooltip>` (tooltip Recharts).
 *
 * Permite que qualquer card ou ponto de gráfico exponha ao usuário final:
 * "Como esse número foi obtido?" — fórmula simbólica, valores individuais,
 * fonte de cada valor, período considerado e observações opcionais.
 */

/** Um valor que entrou no cálculo de uma métrica. */
export interface MetricFormulaValue {
  /** Rótulo humano do valor — ex: "Vendas", "Inscrições". */
  label: string;
  /**
   * Valor numérico ou já formatado em string (ex: `"R$ 1.200,50"`).
   * Strings são exibidas exatamente como fornecidas.
   */
  value: number | string;
  /**
   * Origem do dado — ex: "Meta Ads", "Google Sheets — CRM",
   * "Instagram Graph API · total_interactions".
   */
  source: string;
}

/** Memorial completo do cálculo de uma métrica. */
export interface MetricFormula {
  /**
   * Expressão simbólica do cálculo — ex: "Vendas ÷ Inscrições",
   * "Clicks × CPC", "Σ spend".
   */
  expression: string;
  /** Valores que entraram no cálculo, na ordem em que aparecem na fórmula. */
  values: MetricFormulaValue[];
  /**
   * Resultado formatado, tipicamente mostrando a operação completa:
   * ex: "900 ÷ 1.000 = 0,90 = 90%".
   */
  result: string;
  /**
   * Período considerado, quando um filtro de data está ativo.
   * Formatar em pt-BR — ex: "20/03 — 17/06".
   */
  period?: string;
  /**
   * Observação adicional opcional — ex: "Considerando 3 campanhas
   * selecionadas" ou "Inclui apenas leads qualificados".
   */
  note?: string;
}
