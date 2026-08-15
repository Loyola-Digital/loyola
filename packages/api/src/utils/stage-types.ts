/**
 * Grupos de tipos de etapa que se comportam igual.
 *
 * A Captação de Evento ("event_capture") é a Captação Paga com venda de
 * ingresso no lugar da venda de produto: mesmo tráfego, mesmas planilhas,
 * mesmos KPIs. Antes desse helper a regra vivia espalhada como
 * `stageType !== "paid" && stageType !== "sales"` em cada rota — e um tipo novo
 * precisava ser lembrado em todas elas, uma por uma, pra não sair sem dado.
 */

/** Captação com tráfego: Paga e Captação de Evento. */
export function ehCaptacaoPaga(stageType: string | null | undefined): boolean {
  return stageType === "paid" || stageType === "event_capture";
}

/** Etapas que têm dashboard de vendas (KPIs, planilhas, faturamento). */
export function temDashboardDeVendas(stageType: string | null | undefined): boolean {
  return ehCaptacaoPaga(stageType) || stageType === "sales";
}

/** Etapas que captam lead — servem de fonte pro CRM e pro sync diário. */
export function ehEtapaDeCaptacao(stageType: string | null | undefined): boolean {
  return ehCaptacaoPaga(stageType) || stageType === "free";
}
