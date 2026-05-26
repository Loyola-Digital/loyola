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

export interface SprintDashboardBlock {
  /** UUID gerado no frontend (estável entre updates) */
  id: string;
  title: string;
  /** Hex color (#RRGGBB) — usado pra bolinha + tags do card */
  color: string;
  /** 1+ listas do ClickUp que alimentam esse bloco */
  clickupListIds: string[];
  filters: SprintDashboardBlockFilters;
  /** Como agrupar as tasks dentro do bloco (null = sem agrupamento) */
  groupBy?: "status" | "tag" | "assignee" | null;
  /** Ordem de exibição no dashboard (0 = primeiro) */
  sortOrder: number;
}

export interface SprintDashboardConfig {
  id: string;
  blocks: SprintDashboardBlock[];
  /** UUID do user que fez último update (null = nunca editado) */
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
