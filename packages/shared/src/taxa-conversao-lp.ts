/**
 * Taxa de conversão da LP — Story 18.91.
 *
 * Duas taxas, uma definição para todas as telas (Dados diários, Funil de
 * Conversão, Testes de LPs e o Perpétuo). Nenhuma tela calcula a sua: todas
 * chamam estas funções, e a regra só muda aqui.
 *
 * - **Mídia Paga** = resultado pago ÷ LP View do Meta × 100. O resultado é o
 *   lead pago (Gratuita), o ingresso único pago (Captação Paga) ou a venda
 *   atribuída a anúncio (Perpétuo).
 * - **Consolidada** = resultado total ÷ usuários únicos na LP × 100. Os usuários
 *   vêm do GA4 (`totalUsers`) ou do Plausible (visitantes), recortados pelo
 *   filtro de página da etapa.
 *
 * Módulo folha (sem imports): o web importa `@loyola-x/shared/src/taxa-conversao-lp`
 * sem puxar o resto do pacote para o bundle.
 */

/** Mídia Paga: resultado pago ÷ LP View × 100. Sem LP View não há taxa (`null` → "—"). */
export function txConvMidiaPaga(resultadoPago: number, lpViews: number): number | null {
  if (!(lpViews > 0)) return null;
  return (resultadoPago / lpViews) * 100;
}

/**
 * Por que a Consolidada não tem número.
 *
 * - `sem_fonte`: o projeto não tem GA4 nem Plausible.
 * - `erro`: a consulta à fonte falhou.
 * - `sem_filtro`: a etapa não tem a página configurada (P16: não usa o site inteiro).
 * - `pendente`: a leitura de visitas por dia e por LP ainda não está ligada
 *   (Story 18.91, fatia A: as fontes estavam fora em 20/10/2026).
 */
export type MotivoSemConsolidada = "sem_fonte" | "erro" | "sem_filtro" | "pendente";

export const MENSAGEM_SEM_CONSOLIDADA: Record<MotivoSemConsolidada, string> = {
  sem_fonte: "Sem GA4 nem Plausible neste projeto — não há como contar as visitas da LP.",
  erro: "A consulta das visitas da LP falhou. Veja a aba Analytics da etapa.",
  sem_filtro: "Configure a página da etapa na aba Analytics para contar as visitas da LP.",
  pendente:
    "Ainda sem as visitas da LP: a leitura por dia e por LP (GA4/Plausible) entra na próxima etapa da Story 18.91.",
};

/** Consolidada: resultado total ÷ usuários únicos na LP × 100, ou o motivo de não haver. */
export type TxConvConsolidada =
  | { valor: number | null; motivo?: undefined }
  | { valor: null; motivo: MotivoSemConsolidada };

/**
 * Consolidada a partir dos usuários únicos — ou do motivo de não haver.
 *
 * Os usuários únicos de um período NÃO são a soma dos dias (a mesma pessoa em
 * dois dias conta uma vez): quem chama passa o número consultado para o
 * período inteiro, nunca a soma das linhas.
 */
export function txConvConsolidada(
  resultadoTotal: number,
  usuarios: number | { motivo: MotivoSemConsolidada },
): TxConvConsolidada {
  if (typeof usuarios !== "number") return { valor: null, motivo: usuarios.motivo };
  if (!(usuarios > 0)) return { valor: null };
  return { valor: (resultadoTotal / usuarios) * 100 };
}

/** Texto das fórmulas, para os tooltips das telas. */
export const FORMULA_TX_CONV = {
  midiaPagaLeads: "Tx Conv. Mídia Paga = leads pagos ÷ LP View do Meta × 100.",
  midiaPagaIngressos: "Tx Conv. Mídia Paga = ingressos únicos pagos ÷ LP View do Meta × 100.",
  midiaPagaVendas: "Tx Conv. Mídia Paga = vendas atribuídas a anúncio ÷ LP View do Meta × 100.",
  consolidadaLeads:
    "Tx Conv. Consolidada = leads totais (pagos + orgânicos + sem rastreio, e-mail único) ÷ usuários únicos na LP (GA4/Plausible) × 100.",
  consolidadaIngressos:
    "Tx Conv. Consolidada = ingressos únicos (todas as origens) ÷ usuários únicos na LP (GA4/Plausible) × 100.",
  consolidadaVendas:
    "Tx Conv. Consolidada = compradores únicos ÷ usuários únicos na LP (GA4/Plausible) × 100.",
} as const;
