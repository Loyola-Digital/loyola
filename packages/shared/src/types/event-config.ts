/**
 * Story 19.12 — Config da etapa de Evento Presencial.
 * Produtos vendidos (cada um com sua turma MemberKit) e closers cadastrados.
 * O lançamento de venda no evento só permite escolher produtos/closers daqui.
 */

export interface EventProduct {
  id: string;
  stageId: string;
  name: string;
  /** Turma do MemberKit onde matricular quem compra este produto (null = sem matrícula). */
  memberkitClassroomId: number | null;
  memberkitClassroomName: string | null;
  sortOrder: number;
}

export interface EventCloser {
  id: string;
  stageId: string;
  name: string;
  sortOrder: number;
}

/** Item ao salvar a lista de produtos (PUT substitui a lista inteira). */
export interface EventProductInput {
  name: string;
  memberkitClassroomId?: number | null;
  memberkitClassroomName?: string | null;
}

/** Item ao salvar a lista de closers (PUT substitui a lista inteira). */
export interface EventCloserInput {
  name: string;
}

/**
 * Story 19.12b — planilha de vendas conectada em alguma etapa do funil,
 * candidata a ser "espelhada" como fonte de leads da etapa de Evento.
 */
export interface FunnelSalesSpreadsheetRef {
  id: string;
  stageId: string;
  stageName: string;
  subtype: string;
  spreadsheetName: string;
  sheetName: string;
}

/**
 * Story 19.12c — lead/participante do evento, derivado das planilhas espelhadas.
 * Usado pra buscar/selecionar o cliente na hora de lançar a venda (chave: email).
 */
export interface EventLead {
  email: string;
  name: string;
  phone: string;
}

/**
 * Story 19.13 — Mapa do Evento. Status de um lead na etapa de evento.
 * "bought" é derivado das vendas manuais (não é gravado); os demais o closer marca.
 */
export type EventLeadStatus = "pending" | "negotiating" | "bought" | "declined";

/** Infos da venda de um lead que comprou (agregadas por email). */
export interface EventLeadSale {
  /** Produto da venda mais recente. */
  product: string | null;
  /** Soma do valor de todas as vendas do lead na etapa. */
  value: number;
  /** Vendedor/closer da venda mais recente. */
  sellerName: string | null;
  /** Data da venda mais recente (ISO). */
  saleDate: string | null;
  /** Quantidade de vendas do lead na etapa. */
  count: number;
}

/** Lead do mapa do evento: dados + status computado (+ venda, se comprou). */
export interface EventMapLead {
  email: string;
  name: string;
  phone: string;
  /** Tipo da pessoa (comprador / 2ª cadeira / iFood / fornecedor); "" se não mapeado. */
  tipo: string;
  /** Quem convidou o participante (coluna "Convidado"); "" se não houver. Relevante p/ 2ª cadeira. */
  invitedBy: string;
  /** Email da venda do ingresso (coluna "Email da venda"); "" se não houver. */
  saleEmail: string;
  /** True se respondeu "Empresário(a) dono de restaurante" no campo "Você é:" da pesquisa. */
  isRestaurantOwner: boolean;
  status: EventLeadStatus;
  /** Preenchido quando status = "bought". */
  sale: EventLeadSale | null;
  /** Faturamento mensal da pesquisa (lookup por email); null se não respondeu. Base da calculadora de ROI. */
  revenue: number | null;
  /** Vendedor/closer atribuído ao lead (nome); null se não atribuído. */
  assignedSeller: string | null;
}

export interface EventMapSummary {
  total: number;
  bought: number;
  negotiating: number;
  declined: number;
  pending: number;
  /** Soma do valor das vendas dos leads que compraram. */
  revenue: number;
}

export interface EventMapResponse {
  leads: EventMapLead[];
  summary: EventMapSummary;
}

/** Status que o closer pode definir manualmente (bought é automático). */
export type SettableEventLeadStatus = "pending" | "negotiating" | "declined";

export interface SetEventLeadStatusInput {
  email: string;
  status: SettableEventLeadStatus;
  note?: string | null;
}

/** Atribuir (ou desatribuir, com seller = null) um vendedor a um lead. */
export interface SetEventLeadSellerInput {
  email: string;
  /** Nome do vendedor/closer; null limpa a atribuição. */
  seller: string | null;
}

/** Atribuir (ou desatribuir) um vendedor a vários leads de uma vez. */
export interface SetEventLeadSellerBulkInput {
  emails: string[];
  /** Nome do vendedor/closer; null limpa a atribuição. */
  seller: string | null;
}

/** Uma pergunta/resposta da planilha de um lead (label = cabeçalho da coluna). */
export interface EventLeadAnswer {
  label: string;
  value: string;
}

/** Respostas de um lead agrupadas por planilha de origem. */
export interface EventLeadAnswerGroup {
  /** Nome amigável da planilha de origem. */
  source: string;
  /** Papel da planilha: "participants" (mestre) ou "survey" (respostas). */
  role: string;
  answers: EventLeadAnswer[];
}

export interface EventLeadAnswersResponse {
  email: string;
  groups: EventLeadAnswerGroup[];
}
