/**
 * Story 18.76 — o catálogo de métricas do painel do Top Criativos.
 *
 * O card mostrava um conjunto fixo. Agora o gestor escolhe: cada métrica
 * marcada vira uma barra horizontal abaixo do grid 2×2, e o badge do botão
 * "Métricas" é a soma dos checkboxes.
 *
 * ## Duas decisões que estão no código, e não só na tela
 *
 * **Hold Rate tem UMA fonte** (AC10): `Σ views75 ÷ Σ views3s` do grupo, o mesmo
 * caminho do `hookRate` da 29.65. A outra fonte possível (`videoViews75` de
 * `CampaignAnalytics`) fica fora de propósito — duas fontes para o mesmo rótulo
 * é como a mesma tela passa a mostrar dois Hold Rate.
 *
 * **"Cliques no link" usa cliques no link** (AC11): `linkClicks`, não `clicks`.
 * São números diferentes no mesmo payload, e a tabela de Desempenho de
 * Criativos usa o segundo desde a 18.59.
 */

import type { AggregatedCreative } from "@/lib/utils/top-creatives";

export type CategoriaId =
  | "geral"
  | "impressoes"
  | "funil"
  | "cliques"
  | "conversao"
  | "leads"
  | "vendas";

export type Formato = "moeda" | "numero" | "percentual" | "multiplicador";

export interface MetricaDoCriativo {
  id: string;
  categoria: CategoriaId;
  label: string;
  /** Texto do ícone "i" — a fórmula, não o nome por extenso (AC4). */
  explicacao: string;
  formato: Formato;
  /** Meta para colorir a barra; `null` = cor fixa da categoria. */
  meta?: number;
  /** `true` quando barra grande é gasto grande, não desempenho (AC7). */
  menorEhMelhor?: boolean;
  marcadaPorPadrao?: boolean;
}

export interface Categoria {
  id: CategoriaId;
  label: string;
  /** Categorias colapsadas por padrão. */
  colapsadaPorPadrao?: boolean;
}

export const CATEGORIAS: Categoria[] = [
  { id: "geral", label: "GERAL", colapsadaPorPadrao: true },
  { id: "impressoes", label: "IMPRESSÕES" },
  { id: "funil", label: "FUNIL DO CRIATIVO" },
  { id: "cliques", label: "CLIQUES NO LINK" },
  { id: "conversao", label: "TAXA DE CONVERSÃO", colapsadaPorPadrao: true },
  { id: "leads", label: "LEADS", colapsadaPorPadrao: true },
  { id: "vendas", label: "VENDAS", colapsadaPorPadrao: true },
];

/**
 * Metas de cor iguais às do Detalhamento do Perpétuo e da Captação. Duas telas
 * com o mesmo nome de métrica e faixas de cor diferentes é como se perde a
 * confiança no painel inteiro.
 */
export const META_HOOK = 25;
export const META_HOLD = 13;

export const METRICAS: MetricaDoCriativo[] = [
  // GERAL
  {
    id: "spend",
    categoria: "geral",
    label: "Investimento",
    explicacao: "Soma do gasto de todos os anúncios com este nome, no período.",
    formato: "moeda",
    menorEhMelhor: true,
  },
  {
    id: "reach",
    categoria: "geral",
    label: "Alcance",
    explicacao: "Pessoas distintas alcançadas, somadas dos anúncios do grupo.",
    formato: "numero",
  },
  // IMPRESSÕES
  {
    id: "impressions",
    categoria: "impressoes",
    label: "Impressões",
    explicacao: "Quantas vezes o anúncio foi exibido, somado dos anúncios do grupo.",
    formato: "numero",
  },
  {
    id: "cpm",
    categoria: "impressoes",
    label: "CPM",
    explicacao:
      "Investimento ÷ impressões × 1.000, somados de todos os anúncios com este nome. Não é a média dos CPMs.",
    formato: "moeda",
    menorEhMelhor: true,
    marcadaPorPadrao: true,
  },
  // FUNIL DO CRIATIVO
  {
    id: "hookRate",
    categoria: "funil",
    label: "Hook Rate",
    explicacao:
      "Reproduções de 3s ÷ impressões × 100, somando só os anúncios que têm métrica de vídeo. Verde a partir de 25%.",
    formato: "percentual",
    meta: META_HOOK,
    marcadaPorPadrao: true,
  },
  {
    id: "holdRate",
    categoria: "funil",
    label: "Hold Rate",
    explicacao:
      "Reproduções a 75% ÷ reproduções de 3s × 100 — dos que passaram pelo gancho, quantos seguiram até o corpo do vídeo. Verde a partir de 13%.",
    formato: "percentual",
    meta: META_HOLD,
    marcadaPorPadrao: true,
  },
  // CLIQUES NO LINK
  {
    id: "linkClicks",
    categoria: "cliques",
    label: "Cliques no link",
    explicacao:
      "Cliques que levaram ao destino (inline_link_clicks). Diferente do clique em qualquer lugar do anúncio.",
    formato: "numero",
  },
  {
    id: "ctrLink",
    categoria: "cliques",
    label: "CTR",
    explicacao: "Cliques no link ÷ impressões × 100.",
    formato: "percentual",
    marcadaPorPadrao: true,
  },
  {
    id: "cpcLink",
    categoria: "cliques",
    label: "CPC",
    explicacao: "Investimento ÷ cliques no link.",
    formato: "moeda",
    menorEhMelhor: true,
  },
  // TAXA DE CONVERSÃO
  {
    id: "txConversao",
    categoria: "conversao",
    label: "Conversão",
    explicacao:
      "Conversões ÷ cliques no link × 100 — a mesma Tx Conversão da tabela de Detalhamento. A conversão é a da etapa: venda, ingresso ou lead.",
    formato: "percentual",
  },
  // LEADS
  {
    id: "leadsPagos",
    categoria: "leads",
    label: "Leads pagos",
    explicacao: "Linhas da planilha de leads com utm_content deste criativo e utm_source pago.",
    formato: "numero",
  },
  {
    id: "leadsOrg",
    categoria: "leads",
    label: "Leads orgânicos",
    explicacao: "Mesma planilha, utm_source preenchido e não pago.",
    formato: "numero",
  },
  {
    id: "leadsSemTrack",
    categoria: "leads",
    label: "Leads sem rastreio",
    explicacao: "Mesma planilha, utm_source vazio ou não mapeado.",
    formato: "numero",
  },
  {
    id: "cplPago",
    categoria: "leads",
    label: "CPL",
    explicacao: "Investimento ÷ leads pagos.",
    formato: "moeda",
    menorEhMelhor: true,
  },
  // VENDAS
  {
    id: "vendas",
    categoria: "vendas",
    label: "Vendas",
    explicacao:
      "Compradores distintos atribuídos ao criativo, deduplicados entre os anúncios do grupo.",
    formato: "numero",
  },
  {
    id: "faturamento",
    categoria: "vendas",
    label: "Faturamento",
    explicacao: "Faturamento bruto atribuído ao criativo na planilha de vendas.",
    formato: "moeda",
  },
  {
    id: "roas",
    categoria: "vendas",
    label: "ROAS",
    explicacao: "Faturamento bruto ÷ investimento.",
    formato: "multiplicador",
  },
  {
    id: "cac",
    categoria: "vendas",
    label: "CAC",
    explicacao: "Investimento ÷ vendas.",
    formato: "moeda",
    menorEhMelhor: true,
  },
];

/** As quatro que abrem marcadas — bate com o `Métricas (4)` do relato. */
export function metricasPadrao(): string[] {
  return METRICAS.filter((m) => m.marcadaPorPadrao).map((m) => m.id);
}

export function metricaPorId(id: string): MetricaDoCriativo | undefined {
  return METRICAS.find((m) => m.id === id);
}

/** Badge da categoria: quantas dela estão marcadas. `0` = sem badge (AC1). */
export function contarPorCategoria(marcadas: string[], categoria: CategoriaId): number {
  return marcadas.filter((id) => metricaPorId(id)?.categoria === categoria).length;
}

/** Badge do botão: a soma de todos os checkboxes (AC3). */
export function contarMarcadas(marcadas: string[]): number {
  return marcadas.filter((id) => !!metricaPorId(id)).length;
}

/** Busca por nome dentro do painel; devolve os ids que casam. */
export function buscarMetricas(termo: string): string[] {
  const t = termo.trim().toLowerCase();
  if (!t) return METRICAS.map((m) => m.id);
  return METRICAS.filter((m) => m.label.toLowerCase().includes(t)).map((m) => m.id);
}

/**
 * As categorias que a etapa não tem (AC5).
 *
 * Devolve o motivo por categoria, ou `null` quando ela está disponível. O
 * checkbox fica desabilitado com esse texto no `title` — nunca ausente da
 * lista, porque sumir da tela é lido como "o produto não tem essa métrica".
 */
export function categoriasIndisponiveis(opts: {
  temPlanilhaDeLeads: boolean;
  temPlanilhaDeVendas: boolean;
}): Partial<Record<CategoriaId, string>> {
  const fora: Partial<Record<CategoriaId, string>> = {};
  if (!opts.temPlanilhaDeLeads) {
    fora.leads = "Sem planilha de leads ligada a esta etapa.";
  }
  if (!opts.temPlanilhaDeVendas) {
    fora.vendas = "Sem planilha de vendas ligada a esta etapa.";
    fora.conversao = "A taxa de conversão precisa de uma fonte de conversão ligada à etapa.";
  }
  return fora;
}

// ============================================================
// Valores
// ============================================================

export interface ContextoDeMetrica {
  /** Vendas e faturamento já deduplicados entre os anúncios do grupo. */
  vendas?: number | null;
  faturamento?: number | null;
  /** Conversões da etapa (venda, ingresso ou lead), para a taxa de conversão. */
  conversoes?: number | null;
}

/**
 * Valor de uma métrica para um criativo. `null` = não medido — e é diferente de
 * zero em toda a cadeia: no valor, na barra e na cor.
 */
export function valorDaMetrica(
  id: string,
  c: AggregatedCreative,
  ctx: ContextoDeMetrica = {},
): number | null {
  switch (id) {
    case "spend":
      return c.spend;
    case "reach":
      return c.reach;
    case "impressions":
      return c.impressions;
    case "cpm":
      return c.cpm;
    case "hookRate":
      return c.hookRate;
    case "holdRate":
      return c.holdRate;
    case "linkClicks":
      return c.linkClicks;
    case "ctrLink":
      return c.ctrLink;
    case "cpcLink":
      return c.cpcLink;
    case "txConversao": {
      const conv = ctx.conversoes;
      if (conv == null || c.linkClicks == null || c.linkClicks <= 0) return null;
      return (conv / c.linkClicks) * 100;
    }
    case "leadsPagos":
      return c.leadsPagos;
    case "leadsOrg":
      return c.leadsOrg;
    case "leadsSemTrack":
      return c.leadsSemTrack;
    case "cplPago":
      return c.cplPago;
    case "vendas":
      return ctx.vendas ?? null;
    case "faturamento":
      return ctx.faturamento ?? null;
    case "roas": {
      if (ctx.faturamento == null || c.spend <= 0) return null;
      return ctx.faturamento / c.spend;
    }
    case "cac": {
      if (ctx.vendas == null || ctx.vendas <= 0 || c.spend <= 0) return null;
      return c.spend / ctx.vendas;
    }
    default:
      return null;
  }
}

// ============================================================
// Barras (AC6/AC7)
// ============================================================

/**
 * Maior valor de cada métrica entre os criativos exibidos — o denominador das
 * barras. A comparação é **entre criativos da lista**, não contra um absoluto:
 * uma barra cheia diz "é o maior daqui", e o cabeçalho da lista declara isso.
 */
export function maximosPorMetrica(
  ids: string[],
  criativos: AggregatedCreative[],
  ctxDe: (c: AggregatedCreative) => ContextoDeMetrica,
): Map<string, number> {
  const max = new Map<string, number>();
  for (const c of criativos) {
    const ctx = ctxDe(c);
    for (const id of ids) {
      const v = valorDaMetrica(id, c, ctx);
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      max.set(id, Math.max(max.get(id) ?? 0, v));
    }
  }
  return max;
}

/** Largura da barra, `0..100`. `null` quando não há o que desenhar. */
export function larguraDaBarra(valor: number | null, maximo: number | undefined): number | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  if (!maximo || maximo <= 0) return null;
  if (valor <= 0) return 0;
  return Math.min(100, (valor / maximo) * 100);
}

export type CorDaBarra = "meta-ok" | "meta-abaixo" | "custo" | "neutra";

/**
 * Cor da barra e do valor — as duas sempre iguais (AC6).
 *
 * - métrica com meta: verde acima, neutro abaixo (mesmas faixas do Detalhamento);
 * - métrica de custo: cor própria, porque barra cheia ali **não** é bom;
 * - demais: neutra.
 */
export function corDaBarra(m: MetricaDoCriativo, valor: number | null): CorDaBarra {
  if (valor == null) return "neutra";
  if (m.meta != null) return valor >= m.meta ? "meta-ok" : "meta-abaixo";
  if (m.menorEhMelhor) return "custo";
  return "neutra";
}
