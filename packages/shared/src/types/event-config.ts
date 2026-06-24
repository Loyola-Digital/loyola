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
 * candidata a ser "espelhada" na etapa de Evento.
 */
export interface FunnelSalesSpreadsheetRef {
  id: string;
  stageId: string;
  stageName: string;
  subtype: string;
  spreadsheetName: string;
  sheetName: string;
}
