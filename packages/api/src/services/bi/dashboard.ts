/**
 * O documento do dashboard: forma, validação e período.
 *
 * Fica separado das rotas porque três telas dependem da mesma forma — o canvas
 * (45.4) salva geometria, a galeria (45.5) injeta preset e o editor (45.7)
 * escreve `spec`. Uma forma só, validada num lugar só.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { derivadaSchema, MAX_DERIVADAS, MAX_QUERIES } from "./derivadas.js";
import { querySpecSchema } from "./query.js";
import { FUSO } from "./query.js";

/**
 * Teto de widgets por dashboard.
 *
 * Sessenta consultas disparando juntas já é o limite do que a tela renderiza sem
 * travar — e do que o banco responde sem fila. Passar disso é sinal de que o
 * recorte deveria virar um segundo dashboard.
 */
export const LIMITE_DE_WIDGETS = 60;

/** A grade do canvas. Doze colunas é o que cabe em tela de notebook. */
export const COLUNAS_DO_GRID = 12;

export const geometriaSchema = z.object({
  x: z.number().int().min(0).max(COLUNAS_DO_GRID - 1),
  y: z.number().int().min(0).max(10_000),
  w: z.number().int().min(1).max(COLUNAS_DO_GRID),
  h: z.number().int().min(1).max(40),
});

export const TIPOS_DE_WIDGET = ["kpi", "linha", "barra", "tabela", "pizza", "funil"] as const;

export const widgetSchema = z.object({
  id: z.string().min(1).max(64),
  tipo: z.enum(TIPOS_DE_WIDGET),
  titulo: z.string().min(1).max(120),
  /** A consulta mora no widget, não no cliente — é o que impede spec forjado. */
  spec: querySpecSchema,
  /**
   * Consultas ADICIONAIS (q1, q2, q3) — `spec` é sempre a q0.
   *
   * Existe porque cada consulta pode ter filtros diferentes: é o que permite
   * "lucro" com escopos assimétricos (receita de tudo menos o gasto de uma
   * campanha só). A base continua sendo `spec`, então widget simples não muda de
   * forma para ganhar o campo.
   */
  specsExtras: z.array(querySpecSchema).max(MAX_QUERIES - 1).default([]),
  /** Colunas calculadas a partir das consultas, por parser próprio. */
  derivadas: z.array(derivadaSchema).max(MAX_DERIVADAS).default([]),
  /** A dimensão que casa as linhas das consultas, quando a derivada é por linha. */
  mergeKey: z.string().max(120).optional(),
  geometria: geometriaSchema,
  /** Opções de desenho (cor, formato, meta). Livre de propósito. */
  opcoes: z.record(z.string(), z.unknown()).default({}),
});

export type Widget = z.infer<typeof widgetSchema>;
export type Geometria = z.infer<typeof geometriaSchema>;
export type TipoDeWidget = (typeof TIPOS_DE_WIDGET)[number];

/**
 * O tamanho com que cada tipo nasce.
 *
 * Vive aqui, e não só no cliente, porque a inserção de preset acontece no
 * servidor: se os dois lados escolhessem o tamanho por conta própria, o widget
 * mudaria de forma no primeiro recarregamento da página.
 */
export const PADRAO_POR_TIPO: Record<TipoDeWidget, { w: number; h: number }> = {
  kpi: { w: 3, h: 2 },
  linha: { w: 6, h: 4 },
  barra: { w: 6, h: 4 },
  pizza: { w: 4, h: 4 },
  funil: { w: 4, h: 5 },
  tabela: { w: 6, h: 5 },
};

/**
 * Os períodos com nome.
 *
 * Preset guardado como NOME, nunca como par de datas já resolvido: "últimos 30
 * dias" salvo em agosto precisa continuar significando os últimos 30 dias em
 * setembro.
 */
export const PRESETS_DE_PERIODO = [
  "hoje",
  "ontem",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "this_year",
] as const;

export type PresetDePeriodo = (typeof PRESETS_DE_PERIODO)[number];

export const dateRangeSchema = z.union([
  z.object({ preset: z.enum(PRESETS_DE_PERIODO) }),
  z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

export type DateRange = z.infer<typeof dateRangeSchema>;

export const dashboardSchema = z.object({
  nome: z.string().min(1).max(200),
  widgets: z.array(widgetSchema).max(LIMITE_DE_WIDGETS),
  dateRange: dateRangeSchema,
});

// ============================================================
// Período
// ============================================================

/** A data ISO de "hoje" no fuso do relatório, não no fuso do servidor. */
export function hojeEmSaoPaulo(agora = new Date()): string {
  // `en-CA` porque o formato dele já é `YYYY-MM-DD` — evita remontar a string a
  // partir das partes e errar o zero à esquerda.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  // `Date.UTC` de propósito: a conta é sobre a data-calendário já resolvida no
  // fuso certo, então somar dias em UTC não pode escorregar na virada do
  // horário de verão.
  const t = Date.UTC(a!, m! - 1, d! + dias);
  return new Date(t).toISOString().slice(0, 10);
}

/** O período resolvido em datas ISO, inclusive nas duas pontas. */
export function resolverPeriodo(
  range: DateRange,
  agora = new Date(),
): { start: string; end: string } {
  if ("start" in range) return { start: range.start, end: range.end };

  const hoje = hojeEmSaoPaulo(agora);
  const [ano, mes] = hoje.split("-").map(Number);

  switch (range.preset) {
    case "hoje":
      return { start: hoje, end: hoje };
    case "ontem": {
      const o = somarDias(hoje, -1);
      return { start: o, end: o };
    }
    case "last_7d":
      return { start: somarDias(hoje, -6), end: hoje };
    case "last_14d":
      return { start: somarDias(hoje, -13), end: hoje };
    case "last_30d":
      return { start: somarDias(hoje, -29), end: hoje };
    case "last_90d":
      return { start: somarDias(hoje, -89), end: hoje };
    case "this_month":
      return { start: `${hoje.slice(0, 7)}-01`, end: hoje };
    case "last_month": {
      const anteriorAno = mes === 1 ? ano! - 1 : ano!;
      const anteriorMes = mes === 1 ? 12 : mes! - 1;
      const inicio = `${anteriorAno}-${String(anteriorMes).padStart(2, "0")}-01`;
      // O fim é o dia anterior ao primeiro deste mês — não precisa saber quantos
      // dias o mês passado teve.
      return { start: inicio, end: somarDias(`${hoje.slice(0, 7)}-01`, -1) };
    }
    case "this_year":
      return { start: `${ano}-01-01`, end: hoje };
  }
}

// ============================================================
// Operações sobre o documento
// ============================================================

/**
 * Copia os widgets com identidade nova.
 *
 * Id novo é obrigatório, não cosmético: dois widgets com o mesmo id fariam o
 * canvas salvar a geometria de um por cima do outro.
 */
export function duplicarWidgets(widgets: Widget[]): Widget[] {
  return widgets.map((w) => ({ ...w, id: randomUUID() }));
}

/** O nome da cópia, sem empilhar "(cópia) (cópia)" a cada duplicação. */
export function nomeDaCopia(nome: string): string {
  const base = nome.replace(/\s*\(cópia(?:\s+\d+)?\)$/u, "");
  return `${base} (cópia)`.slice(0, 200);
}

/**
 * Lê os widgets guardados no JSONB.
 *
 * Widget salvo já passou pela validação da escrita, então um inválido aqui só
 * aparece se a forma tiver mudado embaixo do dado. Nesse caso ele é separado —
 * não some em silêncio: a rota devolve a contagem, e a tela pode dizer que
 * "3 widgets antigos não abrem" em vez de simplesmente não desenhá-los.
 */
export function widgetsGuardados(bruto: unknown): { widgets: Widget[]; ilegiveis: number } {
  if (!Array.isArray(bruto)) return { widgets: [], ilegiveis: 0 };
  const widgets: Widget[] = [];
  let ilegiveis = 0;
  for (const item of bruto) {
    const r = widgetSchema.safeParse(item);
    if (r.success) widgets.push(r.data);
    else ilegiveis += 1;
  }
  return { widgets, ilegiveis };
}

/**
 * O primeiro espaço livre da grade para um bloco do tamanho pedido.
 *
 * Mora no servidor porque é ele que insere o preset. Varre linha a linha, da
 * esquerda para a direita — é o que faz "clicar no preset" colocar o widget
 * onde a pessoa esperaria, em vez de no fim da página.
 */
export function primeiroEspacoLivre(
  ocupados: Geometria[],
  tamanho: { w: number; h: number },
): { x: number; y: number } {
  const w = Math.min(tamanho.w, COLUNAS_DO_GRID);
  const colidem = (a: Geometria, b: Geometria) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  const limite = ocupados.reduce((m, b) => Math.max(m, b.y + b.h), 0) + 1;
  for (let y = 0; y <= limite; y += 1) {
    for (let x = 0; x + w <= COLUNAS_DO_GRID; x += 1) {
      const candidato = { x, y, w, h: tamanho.h };
      if (!ocupados.some((b) => colidem(candidato, b))) return { x, y };
    }
  }
  return { x: 0, y: limite };
}
