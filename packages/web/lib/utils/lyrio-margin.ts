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
 * **Aritmética em centavos (QA-09).** Cada parcela é arredondada ao centavo e as
 * derivadas saem das parcelas já arredondadas. A versão anterior calculava em
 * precisão total e deixava a formatação para a UI — o que fazia o memorial
 * exibir uma cadeia que não fechava em 46,8% dos casos: o usuário somava as
 * quatro linhas e chegava a um centavo de distância do líquido exibido.
 *
 * Num memorial, a conta fechar não é detalhe estético: é a única razão de ele
 * existir. Centavo é a menor unidade real de dinheiro, e a margem é um valor
 * final, não um intermediário que alguém vá compor depois.
 */

/** Arredonda ao centavo. `Math.round` sobre centavos inteiros, não `toFixed`. */
export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Reparte um total em parcelas que **fecham** quando exibidas em centavos.
 *
 * Arredonda todas as parcelas menos a última; a última absorve o resto, de
 * modo que a soma das parcelas exibidas seja exatamente o total exibido.
 * Sem isto, dois arredondamentos independentes divergem do total em ~25% dos
 * casos (QA-04).
 */
export function fecharEmCentavos(total: number, partes: number[]): number[] {
  if (partes.length === 0) return [];
  const alvo = centavos(total);
  const iniciais = partes.slice(0, -1).map(centavos);
  const soma = iniciais.reduce((a, b) => a + b, 0);
  return [...iniciais, centavos(alvo - soma)];
}

/**
 * Converte o que o usuário digitou num percentual.
 *
 * Campo vazio devolve `NaN` — e **não** zero (QA-08). `Number("")` é `0`, e
 * como 0% é um percentual legítimo, o campo apagado passava direto pela
 * validação e gravava zero em silêncio. Zerar a comissão de loja infla a
 * margem, que é o erro mais caro que este formulário pode cometer.
 */
export function parsePercentual(entrada: string): number {
  if (entrada.trim() === "") return Number.NaN;
  return Number(entrada.replace(",", "."));
}

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
  /** Bruto já ao centavo — é o que o memorial deve exibir como primeira linha. */
  faturamentoBruto: number;
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
  // Tudo em centavos, e as derivadas saem das parcelas JÁ arredondadas — é o
  // que faz a cadeia do memorial fechar quando o usuário soma as linhas.
  const bruto = centavos(faturamentoBrutoBrl);
  const descontosPlataforma = centavos(bruto * (platformFeePct / 100));
  const imposto = centavos(bruto * (taxPct / 100));
  const outrosCustos = centavos(bruto * (otherCostsPct / 100));

  const faturamentoLiquido = centavos(
    bruto - descontosPlataforma - imposto - outrosCustos,
  );

  const investimentoTotal = centavos(
    centavos(investimentoMetaLiquidoBrl) +
      centavos(impostoMetaBrl) +
      centavos(investimentoGoogleBrl),
  );

  return {
    faturamentoBruto: bruto,
    descontosPlataforma,
    imposto,
    outrosCustos,
    faturamentoLiquido,
    investimentoTotal,
    // Sem clamp: margem negativa é informação, não erro a esconder.
    margem: centavos(faturamentoLiquido - investimentoTotal),
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
