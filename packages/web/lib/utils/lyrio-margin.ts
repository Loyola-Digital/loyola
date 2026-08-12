/**
 * Story 42.4 — Margem de Contribuição da etapa Lyrio (app mobile).
 *
 * Entre o que o cliente paga e o que sobra existe uma cadeia de descontos que o
 * ROAS ignora: comissão da loja (Apple/Google), imposto sobre a receita, custos
 * operacionais e o investimento em mídia — este último acrescido do imposto de
 * 12,15% da Meta.
 *
 * Memorial especificado pelo gestor (2026-08-12):
 *
 *   Faturamento Bruto                                 10.000,00
 *   − Descontos da plataforma (15%)                    1.500,00
 *   − Imposto (5%)                                       500,00
 *   − Outros custos (1%)                                 100,00
 *   = Faturamento Líquido                              7.900,00
 *   − Investimento (Meta + Google)                     5.000,00
 *   − Imposto Meta (12,15%, gross-up)                    691,52
 *   = Margem de Contribuição                           2.208,48
 *
 * Os três percentuais incidem sobre o BRUTO, não em cascata.
 *
 * O imposto da Meta entra como parcela separada porque é assim que o memorial
 * precisa exibi-lo. Numericamente, `investimentoMetaLiquido + impostoMeta` é o
 * mesmo valor que o card "Investimento (Meta)" já mostra — quem chama deve usar
 * `sumMetaSpendWithTax` (funnel-metrics) para obter as duas parcelas, em vez de
 * recalcular a alíquota e arriscar divergir do card.
 *
 * Sem arredondamento interno: arredondar etapas intermediárias faz o total
 * divergir da soma das linhas exibidas. A formatação é responsabilidade da UI.
 */

export interface MargemContribuicaoInput {
  /** Receita bruta do período, em R$ (RevenueCat convertido pelo câmbio). */
  faturamentoBrutoBrl: number;
  /** Comissão da loja (Apple/Google), em % do bruto. Ex: 15 para 15%. */
  platformFeePct: number;
  /** Imposto sobre a receita, em % do bruto. */
  taxPct: number;
  /** Outros custos, em % do bruto. */
  otherCostsPct: number;
  /** Investimento Meta SEM o imposto de 12,15%, em R$. */
  investimentoMetaLiquidoBrl: number;
  /** Parcela do imposto de 12,15% sobre a Meta, em R$. */
  impostoMetaBrl: number;
  /** Investimento Google Ads, em R$. Não sofre o imposto da Meta. */
  investimentoGoogleBrl: number;
}

export interface MargemContribuicaoResult {
  descontosPlataforma: number;
  imposto: number;
  outrosCustos: number;
  /** Bruto menos os três descontos acima. */
  faturamentoLiquido: number;
  /** Meta líquido + imposto Meta + Google. */
  investimentoTotal: number;
  /** Faturamento líquido menos investimento total. Pode ser negativo. */
  margem: number;
}

export function calcularMargemContribuicao({
  faturamentoBrutoBrl,
  platformFeePct,
  taxPct,
  otherCostsPct,
  investimentoMetaLiquidoBrl,
  impostoMetaBrl,
  investimentoGoogleBrl,
}: MargemContribuicaoInput): MargemContribuicaoResult {
  const descontosPlataforma = faturamentoBrutoBrl * (platformFeePct / 100);
  const imposto = faturamentoBrutoBrl * (taxPct / 100);
  const outrosCustos = faturamentoBrutoBrl * (otherCostsPct / 100);

  const faturamentoLiquido =
    faturamentoBrutoBrl - descontosPlataforma - imposto - outrosCustos;

  const investimentoTotal =
    investimentoMetaLiquidoBrl + impostoMetaBrl + investimentoGoogleBrl;

  return {
    descontosPlataforma,
    imposto,
    outrosCustos,
    faturamentoLiquido,
    investimentoTotal,
    // Sem clamp: margem negativa é informação, não erro a esconder.
    margem: faturamentoLiquido - investimentoTotal,
  };
}

/** Percentuais padrão quando a etapa nunca foi configurada. */
export const MARGEM_DEFAULTS = {
  platformFeePct: 15,
  taxPct: 5,
  otherCostsPct: 1,
} as const;

/**
 * Os três percentuais somados não podem passar de 100: acima disso o
 * faturamento líquido fica negativo por construção e o card vira ficção.
 * Usado na validação do formulário e espelhado na API.
 */
export function validarPercentuaisMargem(p: {
  platformFeePct: number;
  taxPct: number;
  otherCostsPct: number;
}): { ok: true } | { ok: false; erro: string } {
  const campos = [
    { nome: "Descontos da plataforma", v: p.platformFeePct },
    { nome: "Imposto", v: p.taxPct },
    { nome: "Outros custos", v: p.otherCostsPct },
  ];
  for (const c of campos) {
    if (!Number.isFinite(c.v)) return { ok: false, erro: `${c.nome}: informe um número.` };
    if (c.v < 0 || c.v > 100) return { ok: false, erro: `${c.nome}: use um valor entre 0 e 100.` };
  }
  const soma = p.platformFeePct + p.taxPct + p.otherCostsPct;
  if (soma > 100) {
    return {
      ok: false,
      erro: `Os três percentuais somam ${soma.toFixed(2)}%. Juntos não podem passar de 100%.`,
    };
  }
  return { ok: true };
}
