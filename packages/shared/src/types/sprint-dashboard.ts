/**
 * Epic 31 — Sprint Dashboard
 *
 * Config global do dashboard de sprint integrado com ClickUp. Singleton:
 * 1 row no DB pra toda a Loyola compartilhar.
 */

export interface SprintDashboardBlockFilters {
  /** Status names do ClickUp (ex: "ready for dev", "in progress", "done") */
  statuses?: string[];
  /** Nomes de tags do ClickUp */
  tags?: string[];
  /** User IDs do ClickUp (números como string) */
  assigneeIds?: string[];
}

/**
 * Fase de uma campanha — usada pela view "Calendário Macro".
 * Cada fase tem nome + data inicial + data final + cor opcional.
 */
export interface SprintCampaignPhase {
  id: string;
  label: string;
  /** YYYY-MM-DD ou string descritiva ("a definir") */
  startDate: string;
  /** YYYY-MM-DD ou string descritiva. Vazio = fase pontual (só startDate). */
  endDate?: string;
  /** Hex color opcional. Default usa a cor do bloco. */
  color?: string;
}

/**
 * Seção de conteúdo do card no Calendário Macro. Cada seção vira um botão
 * (ex: "Contexto", "Bônus") — clicar mostra/esconde o conteúdo. O time escolhe
 * o label de cada botão.
 */
export interface SprintContextSection {
  id: string;
  /** Rótulo do botão (ex: "Contexto", "Bônus", "Oferta") */
  label: string;
  /** Texto livre exibido quando a seção está aberta */
  content: string;
}

export interface SprintDashboardBlock {
  /** UUID gerado no frontend (estável entre updates) */
  id: string;
  title: string;
  /** Subtítulo opcional (ex: "Workshop churrasco gravado") */
  subtitle?: string;
  /** Hex color (#RRGGBB) — usado pra bolinha + tags do card */
  color: string;
  /** 1+ listas do ClickUp que alimentam esse bloco */
  clickupListIds: string[];
  filters: SprintDashboardBlockFilters;
  /** Como agrupar as tasks dentro do bloco (null = sem agrupamento) */
  groupBy?: "status" | "tag" | "assignee" | null;
  /** Ordem de exibição no dashboard (0 = primeiro) */
  sortOrder: number;
  /** Fases da campanha pro Calendário Macro (opcional) */
  campaignPhases?: SprintCampaignPhase[];
  /** Story 31.7: contexto manual (legado, seção única). Mantido por compat —
   * migrado pra `contextSections` na 1ª edição. Empty/null = usa auto. */
  manualContext?: string | null;
  /** Seções de conteúdo do Calendário Macro (botões: Contexto, Bônus, etc).
   * Cada uma aparece só ao clicar no botão correspondente. */
  contextSections?: SprintContextSection[];
  /** Escopo de prazo das tarefas exibidas no card da Visão Geral:
   * - "today_overdue": só tarefas de hoje + atrasadas (default de novos cards)
   * - "all": todas as tarefas do bloco
   * undefined = today_overdue (padrão pedido pelo time). */
  dueScope?: "all" | "today_overdue";
}

export interface SprintDashboardConfig {
  id: string;
  blocks: SprintDashboardBlock[];
  /** UUID do user que fez último update (null = nunca editado) */
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
