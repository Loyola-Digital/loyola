/**
 * As formas do construtor de BI, do lado do cliente.
 *
 * Espelham o que a API valida — não são importadas de `@loyola-x/shared` porque
 * value import de shared quebra o build do Next (o tipo passa no `tsc` e falha
 * no bundle). Aqui é só tipo, sem valor em tempo de execução.
 */

export type TipoDeWidget = "kpi" | "linha" | "barra" | "tabela" | "pizza" | "funil";

export type Operador =
  | "$eq"
  | "$neq"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$in"
  | "$nin"
  | "$like"
  | "$ncontains"
  | "$between"
  | "$isnull"
  | "$isnotnull";

export interface Filtro {
  operator: Operador;
  value?: string | number | (string | number)[];
}

export interface QuerySpec {
  entity: "trafego" | "vendas" | "aplicacoes" | "grupos";
  metrics: string[];
  dimensions: string[];
  filters: Record<string, Filtro>;
  order_by: { field: string; direction: "asc" | "desc" }[];
  limit: number;
  date_granularity: "day" | "week" | "month";
}

/** Posição na grade, em células. `x` e `y` são 0-based. */
export interface Geometria {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Widget {
  id: string;
  tipo: TipoDeWidget;
  titulo: string;
  spec: QuerySpec;
  geometria: Geometria;
  opcoes: Record<string, unknown>;
}

export type DateRange = { preset: string } | { start: string; end: string };

export interface Slicer {
  field: string;
  values: string[];
}

export interface Dashboard {
  id: string;
  projectId: string;
  nome: string;
  widgets: Widget[];
  widgetsIlegiveis: number;
  dateRange: DateRange;
  /** O recorte que vale para o canvas inteiro — estado do dashboard, não da tela. */
  slicers: Slicer[];
  periodo: { start: string; end: string };
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResultadoDaQuery {
  columns: { key: string; label: string; semanticType: string }[];
  rows: Record<string, string | number | null>[];
  avisos: string[];
  ms?: number;
}

export interface CampoDoCatalogo {
  key: string;
  label: string;
  entity: string;
  role: "metric" | "dimension";
  semanticType: "currency" | "number" | "percent" | "date" | "text";
  aggregation: string;
  dataType: string;
  formula?: string;
  nullWhenEmpty?: boolean;
  familia?: "geral" | "atribuido";
  description: string;
}
