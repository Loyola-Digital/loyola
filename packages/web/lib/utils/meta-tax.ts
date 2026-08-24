/**
 * Imposto sobre Meta Ads (12,15%, vigente desde 01/01/2026).
 *
 * A API da Meta devolve o investimento LÍQUIDO — o imposto não está lá. As
 * rotas de tráfego mantêm essa convenção de propósito (`spend` volta bruto) e
 * deixam o gross-up para o frontend, que aplica UMA vez.
 *
 * O risco desse desenho é o inverso do dobrar: esquecer. Foi o que aconteceu no
 * gráfico de Comparação de Lançamentos — a tabela diária da etapa mostrava
 * R$ 271,68 num dia em que o gráfico mostrava R$ 238,67, e os dois estavam
 * "certos" pelas suas próprias contas. Quem olha os dois na mesma tela conclui
 * que um deles está quebrado.
 */

/** Antes disto não havia imposto: aplicar retroativo inventaria custo. */
const VIGENCIA = "2026-01-01";
const ALIQUOTA = 0.1215;

/**
 * Investimento com imposto, a partir do valor líquido da Meta.
 *
 * Gross-up "por dentro" — `valor / (1 − alíquota)`, não `valor × (1 + alíquota)`.
 * A diferença não é acadêmica: em R$ 238,67 a primeira fórmula dá R$ 271,68 e a
 * segunda R$ 267,67.
 */
export function comImpostoMeta(spend: number, dataIsoYmd: string | null | undefined): number {
  if (!dataIsoYmd || dataIsoYmd < VIGENCIA) return spend;
  return spend / (1 - ALIQUOTA);
}
