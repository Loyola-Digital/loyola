// Story 48.7 — onde se ENTRA no Painel de Planejamento, como função pura.
//
// A 48.1 entregou a entrada num cartão do grid do funil e a condição
// `funnelType === "launch"` escrita solta em dois lugares. Na primeira vez que
// o dono do produto foi usar, não achou o cartão: tentou
// `…/funnels/{id}/stages/{stageId}/planejamento` e levou 404 — a rota é do
// FUNIL, não da etapa. Daí esta story (entrada também nas Configurações do
// Funil) e daí este módulo: a condição e o caminho passam a ter um lugar só,
// em `lib/utils`, que é o que o runner do web coleta
// (`include: ["lib/utils/**/*.test.ts"]` — `components/**` fica fora).

/** Os quatro `value` das abas do painel — contrato de URL (Epic 46): não renomear. */
export const ABAS_DO_PLANEJAMENTO = ["inputs", "organicos", "pagos", "resumo"] as const;
export type AbaDoPlanejamento = (typeof ABAS_DO_PLANEJAMENTO)[number];

/**
 * Este funil tem Painel de Planejamento?
 *
 * Só funil de LANÇAMENTO (decisão E1 do Epic 48: um simulador por funil
 * `launch`). Comparação exata e sensível a caixa — `funnelType` vem da API
 * como `"launch" | "perpetual" | "mobile"`; qualquer outra coisa (inclusive
 * `null` enquanto carrega) é "não".
 */
export function temPainelDePlanejamento(funnelType: string | null | undefined): boolean {
  return funnelType === "launch";
}

/**
 * Caminho do painel — sub-página do FUNIL.
 *
 * ⚠️ Sem `stages/{stageId}` no meio: essa rota não existe (o build tem
 * `/projects/[id]/funnels/[funnelId]/planejamento` e
 * `/projects/[id]/funnels/[funnelId]/stages/[stageId]`, e nada abaixo da
 * segunda). Foi o 404 de 22/09; o teste deste módulo falha se voltar.
 */
export function planejamentoHref(projectId: string, funnelId: string, tab?: AbaDoPlanejamento): string {
  const base = `/projects/${projectId}/funnels/${funnelId}/planejamento`;
  return tab ? `${base}?tab=${tab}` : base;
}
