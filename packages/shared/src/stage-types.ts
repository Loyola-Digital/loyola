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

/**
 * Etapa de Aplicação — a página capta por formulário, e a venda vem depois.
 *
 * Fica FORA de `ehCaptacaoPaga` de propósito: aquela função liga o dashboard de
 * captação inteiro (KPIs de lead, venda manual, comprovante), e esta etapa tem
 * um dashboard próprio. O que ela compartilha é o tráfego, não o resto.
 */
export function ehEtapaDeAplicacao(stageType: string | null | undefined): boolean {
  return stageType === "application";
}

/** Etapas que têm dashboard de vendas (KPIs, planilhas, faturamento). */
export function temDashboardDeVendas(stageType: string | null | undefined): boolean {
  return ehCaptacaoPaga(stageType) || stageType === "sales";
}

/** Etapas que captam lead — servem de fonte pro CRM e pro sync diário. */
export function ehEtapaDeCaptacao(stageType: string | null | undefined): boolean {
  // A etapa de Aplicação capta lead como qualquer outra — quem se aplica é
  // lead, e o CRM e o sync diário precisam enxergá-lo.
  if (stageType === "application") return true;
  return ehCaptacaoPaga(stageType) || stageType === "free";
}

/**
 * Tipos que devem casar entre si ao comparar dois lançamentos.
 *
 * A comparação procura, no funil anterior, a etapa "equivalente" a esta. Com
 * igualdade exata de tipo, uma Captação de Evento (`event_capture`) nunca acha
 * a Captação Paga (`paid`) do lançamento passado — e o gráfico de comparação
 * simplesmente não aparece, sem erro e sem explicação. Era o caso do
 * `bbe-pr2-ago-26` contra o `bbe-pr1-mar-26`.
 *
 * As duas medem a mesma coisa (tráfego pago levando a uma captação); o que muda
 * é o que se vende no fim. Para comparar lançamento com lançamento, são a mesma
 * etapa.
 */
export function tiposEquivalentes(stageType: string | null | undefined): string[] {
  if (ehCaptacaoPaga(stageType)) return ["paid", "event_capture"];
  return stageType ? [stageType] : [];
}
