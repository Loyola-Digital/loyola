/**
 * Story 19.15 — Plano de Vendas (Evento Presencial).
 *
 * Cruza N planilhas de pesquisa (1 por tipo: comprador / fornecedor / iFood …)
 * por email e aplica uma matriz GLOBAL de faixas de faturamento → oferta. O
 * resultado é um documento comercial (KPIs + participantes segmentados por
 * faixa + oferta recomendada) renderizado na aba "Plano de Vendas".
 *
 * - As pesquisas SÃO a lista de participantes (não há planilha "mestre"): a
 *   lista final é a união das fontes, deduplicada por email.
 * - O "tipo" vem da própria fonte (não de uma coluna) e é só informativo.
 */

/** Papel da planilha conectada à etapa. */
export type SalesPlanSourceRole =
  /** Lista mestre de participantes (todo mundo). Fornece nome/email/telefone/tipo. */
  | "participants"
  /** Respostas de pesquisa (Tally). Fornece faturamento por email (lookup na mestre). */
  | "survey";

/**
 * Mapeamento de colunas de uma planilha do evento → campos usados.
 * - role "participants": name/email/telefone/tipo (a lista do Mapa e do Plano).
 * - role "survey": email/faturamento (enriquece a mestre por email).
 */
export interface SalesPlanSourceMapping {
  /** Coluna com o nome da pessoa (mestre). */
  name?: string;
  /** Coluna com o email — chave de cruzamento/dedup (obrigatória). */
  email?: string;
  /** Coluna com o telefone (mestre; usada no Mapa do Evento). */
  telefone?: string;
  /** Coluna com o tipo da pessoa: fornecedor/comprador/iFood (mestre). */
  tipo?: string;
  /** Coluna com o faturamento (respostas; texto cru, parseado no servidor). */
  faturamento?: string;
}

/** Planilha conectada à etapa de Evento. */
export interface SalesPlanSource {
  id: string;
  stageId: string;
  /** Papel: "participants" (mestre) ou "survey" (respostas). */
  role: SalesPlanSourceRole;
  /** Rótulo livre da planilha (opcional; só identificação na lista). */
  tipo: string;
  /** ID da planilha do Google (string, não uuid). */
  spreadsheetId: string;
  /** Nome amigável da planilha (exibição). */
  spreadsheetName: string;
  sheetName: string;
  mapping: SalesPlanSourceMapping;
  sortOrder: number;
}

/** Item ao salvar a lista de fontes (PUT substitui a lista inteira). */
export interface SalesPlanSourceInput {
  role: SalesPlanSourceRole;
  tipo?: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  mapping: SalesPlanSourceMapping;
}

/**
 * Faixa da matriz de decisão (global). A primeira regra (em sortOrder) cujo
 * intervalo [minRevenue, maxRevenue) contém o faturamento define a oferta.
 * minRevenue/maxRevenue nulos = sem piso / sem teto.
 */
export interface SalesPlanRule {
  id: string;
  stageId: string;
  /** Rótulo da faixa (ex.: "Tier A", "Aceleração"). */
  label: string;
  minRevenue: number | null;
  maxRevenue: number | null;
  /** Oferta recomendada (texto livre; pode espelhar um produto cadastrado). */
  offer: string;
  sortOrder: number;
}

/** Item ao salvar a lista de regras (PUT substitui a lista inteira). */
export interface SalesPlanRuleInput {
  label: string;
  minRevenue?: number | null;
  maxRevenue?: number | null;
  offer: string;
}

/** Participante do plano (1 por email), já cruzado e classificado. */
export interface SalesPlanParticipant {
  email: string;
  name: string;
  tipo: string;
  /** Faturamento parseado; null = não informado / não interpretável. */
  revenue: number | null;
  /** Valor cru da planilha (pra exibir/validar o parsing). */
  revenueRaw: string | null;
  /** Label da faixa que casou (null = sem faixa). */
  ruleLabel: string | null;
  /** Oferta recomendada resolvida (null = sem faixa). */
  offer: string | null;
}

/** Grupo de participantes por faixa (matched), pra montar a tabela segmentada. */
export interface SalesPlanTierGroup {
  ruleId: string;
  label: string;
  minRevenue: number | null;
  maxRevenue: number | null;
  offer: string;
  count: number;
  participants: SalesPlanParticipant[];
}

export interface SalesPlanTypeCount {
  tipo: string;
  count: number;
}

export interface SalesPlanSummary {
  totalParticipants: number;
  /** Quantos têm faturamento informado/parseável. */
  withRevenue: number;
  /** Quantos NÃO têm faturamento (bloqueio comercial — cobrar formulário). */
  withoutRevenue: number;
  /** Soma dos faturamentos informados (potencial bruto da base). */
  totalRevenue: number;
  byType: SalesPlanTypeCount[];
}

export interface SalesPlanResponse {
  /** Todos os participantes (dedup por email). */
  participants: SalesPlanParticipant[];
  /** Participantes agrupados por faixa casada (ordem das regras). */
  tiers: SalesPlanTierGroup[];
  /** Sem faturamento OU faturamento fora de qualquer faixa. */
  unmatched: SalesPlanParticipant[];
  rules: SalesPlanRule[];
  summary: SalesPlanSummary;
}
