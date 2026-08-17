/**
 * Story 19.14 — grupos de tipos de etapa que se comportam igual.
 *
 * ## Por que estes helpers existem
 *
 * A Captação de Evento (`event_capture`) é a Captação Paga com venda de
 * ingresso no lugar da venda de produto: mesmo tráfego, mesmas planilhas,
 * mesmos KPIs. Antes deles a regra vivia espalhada como
 * `stageType !== "paid" && stageType !== "sales"` em cada rota — e um tipo novo
 * precisava ser lembrado em todas elas, uma por uma, pra não sair sem dado.
 *
 * ## Por que aqui, e não em `api/src/utils/`
 *
 * Nasceram na API (commit `e3b8ea9d`), e o frontend ficou de fora: o
 * `launch-dashboard.tsx` comparava `stageType === "paid"` em 28 pontos, então
 * a única etapa `event_capture` de produção abria sem faturamento, sem
 * ingressos e sem a seção de vendas — com a API servindo tudo do outro lado.
 * Exatamente a falha que os helpers existiam para impedir, repetida no lado
 * que não os conhecia. Compartilhar é o que fecha essa porta.
 *
 * ## Módulo folha, de propósito
 *
 * **Sem nenhum import** — mesmo desenho de `contract.ts`, e pelo mesmo motivo:
 * o webpack do Next não resolve os imports NodeNext (`./types/funnel.js`) que
 * o `index.ts` usa, e o web consome isto por `@loyola-x/shared/src/stage-types`
 * sem arrastar a árvore de tipos junto. A assinatura é `string` em vez de
 * `StageType` justamente para não precisar do import — e porque o valor chega
 * do banco como texto de qualquer forma.
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
