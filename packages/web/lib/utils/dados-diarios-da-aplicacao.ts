// Story 18.96 — investimento e "Dados diários" da etapa de Aplicação: Meta das
// campanhas da etapa × aplicações da planilha, um dia por linha.
//
// As fórmulas são as da Captação e da etapa de Vendas, aplicadas ao período e
// ao dia:
//   Investimento               = spend com o imposto Meta (sumMetaInsights)
//   Custo por aplicação paga   = investimento ÷ aplicações da Meta (P6)
//   Custo por aplicação geral  = investimento ÷ todas as aplicações
//   CTR / CPM / CPC            = pelo clique no LINK, CTR em %
// Os cards SÃO o Total (mesma função, mesma soma): por isso a tabela fecha com
// eles por construção (AC7). Derivadas recalculadas a partir das somas, nunca
// média (regra da 18.62).
//
// Fonte das aplicações por dia:
//   - API ≥ contrato 57: `diarioDeAplicacoes`, contado no mesmo array do card
//     "Aplicações", com o balde das sem data (linha "Sem data", AC6).
//   - API anterior: só o resumo do período. Os cards saem do resumo (pagas =
//     origens Meta de `porUtmSource`) e os dias ficam só com a Meta (AC9).

import { ehOrigemMetaDeLead } from "@loyola-x/shared/src/leads-pagos";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type {
  ContagemDeAplicacoes,
  DashboardDaAplicacao,
  QuebraPorOrigem,
} from "@/lib/hooks/use-stage-application";
import { safeDivide, sumMetaInsights } from "@/lib/utils/funnel-metrics";
import { ordenarLinhasPorDia, type OrdemDoDia } from "@/lib/utils/ordem-do-dia";

/** A Meta não devolve mais que isso (`campaign-daily`, `days` ≤ 365). */
export const DIAS_MAX_DA_META = 365;

/**
 * A janela da Meta para a janela da etapa (P5): "Tudo" (`null`) vira 365 dias,
 * o máximo que a Meta entrega. As aplicações continuam sem limite.
 */
export function diasDaMeta(dias: number | null): number {
  return dias == null ? DIAS_MAX_DA_META : Math.min(dias, DIAS_MAX_DA_META);
}

export interface LinhaDiariaDaAplicacao {
  /** `aaaa-mm-dd`; vazio na linha "Sem data" e no Total. */
  date: string;
  /** `null` = sem campanha, fora da janela da Meta, ou a linha "Sem data". */
  investimento: number | null;
  /** `null` = a API anterior não conta por dia (AC9). */
  aplicacoes: number | null;
  aplicacoesPagas: number | null;
  custoPorAplicacaoPaga: number | null;
  custoPorAplicacaoGeral: number | null;
  impressoes: number | null;
  cliques: number | null;
  /** Em %. */
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  lpViews: number | null;
}

export interface DadosDiariosDaAplicacao {
  dias: LinhaDiariaDaAplicacao[];
  /** Só quando existe aplicação sem data (AC6). */
  semData: LinhaDiariaDaAplicacao | null;
  /** `null` = nada para mostrar no período (AC7: a tabela some). */
  total: LinhaDiariaDaAplicacao | null;
  /** Os cards de investimento e custo; `null` sem campanha vinculada (AC3). */
  cards: LinhaDiariaDaAplicacao | null;
  /** A API conta aplicações por dia? `false` = API anterior ao contrato 57. */
  temAplicacoesPorDia: boolean;
}

type Meta = { spend: number; impressions: number; linkClicks: number; lpViews: number };

const ZERO_META: Meta = { spend: 0, impressions: 0, linkClicks: 0, lpViews: 0 };

function linha(date: string, apl: ContagemDeAplicacoes | null, meta: Meta | null): LinhaDiariaDaAplicacao {
  const inv = meta ? meta.spend : null;
  return {
    date,
    investimento: inv,
    aplicacoes: apl ? apl.total : null,
    aplicacoesPagas: apl ? apl.pagas : null,
    custoPorAplicacaoPaga: inv != null && apl ? safeDivide(inv, apl.pagas) : null,
    custoPorAplicacaoGeral: inv != null && apl ? safeDivide(inv, apl.total) : null,
    impressoes: meta ? meta.impressions : null,
    cliques: meta ? meta.linkClicks : null,
    ctr: meta ? safeDivide(meta.linkClicks * 100, meta.impressions) : null,
    cpm: meta ? safeDivide(meta.spend * 1000, meta.impressions) : null,
    cpc: meta ? safeDivide(meta.spend, meta.linkClicks) : null,
    lpViews: meta ? meta.lpViews : null,
  };
}

function metaPorDia(insights: readonly CampaignDailyInsight[] | null | undefined): Map<string, Meta> {
  const porDia = new Map<string, CampaignDailyInsight[]>();
  for (const row of insights ?? []) {
    const d = row.date_start.slice(0, 10);
    const lista = porDia.get(d) ?? [];
    lista.push(row);
    porDia.set(d, lista);
  }
  const out = new Map<string, Meta>();
  for (const [d, rows] of porDia) {
    const s = sumMetaInsights([rows]);
    out.set(d, { spend: s.spend, impressions: s.impressions, linkClicks: s.linkClicks, lpViews: s.lpViews });
  }
  return out;
}

/** Aplicações da Meta pelo resumo — o caminho da API anterior (AC9). */
export function aplicacoesPagasDoResumo(porUtmSource: readonly QuebraPorOrigem[]): number {
  let n = 0;
  for (const q of porUtmSource) if (ehOrigemMetaDeLead(q.origem)) n += q.aplicacoes;
  return n;
}

export function montarDadosDiariosDaAplicacao(args: {
  /** `useCampaignDailyInsightsBulk` das campanhas da etapa, em `diasDaMeta(dias)`. */
  meta: readonly CampaignDailyInsight[] | null | undefined;
  /** Etapa sem campanha vinculada → sem cards e sem colunas da Meta (AC3). */
  temCampanha: boolean;
  /** `useDashboardDaAplicacao` da mesma janela. */
  dashboard: Pick<DashboardDaAplicacao, "resumo" | "diarioDeAplicacoes"> | null | undefined;
  /**
   * Primeiro dia que a Meta cobre (`aaaa-mm-dd`). Dia de aplicação anterior a
   * ele (janela "Tudo") fica com a Meta em "—": "R$ 0" diria que não houve
   * gasto, e só não houve leitura.
   */
  metaDesde?: string;
  ordem?: OrdemDoDia;
}): DadosDiariosDaAplicacao {
  const meta = args.temCampanha ? metaPorDia(args.meta) : new Map<string, Meta>();
  const diario = args.dashboard?.diarioDeAplicacoes;
  const resumo = args.dashboard?.resumo;
  const temAplicacoesPorDia = !!diario;

  const datas = new Set<string>();
  for (const [d, m] of meta) if (m.spend > 0 || m.impressions > 0) datas.add(d);
  for (const [d, c] of Object.entries(diario?.dias ?? {})) if (c.total > 0) datas.add(d);

  const metaDoDia = (d: string): Meta | null => {
    if (!args.temCampanha) return null;
    if (args.metaDesde && d < args.metaDesde) return null;
    return meta.get(d) ?? ZERO_META;
  };

  const dias = ordenarLinhasPorDia(
    [...datas].map((d) => linha(d, diario ? (diario.dias[d] ?? { total: 0, pagas: 0 }) : null, metaDoDia(d))),
    args.ordem,
  );
  const semData = diario && diario.semData.total > 0 ? linha("", diario.semData, null) : null;

  // Aplicações do período: com o diário, a soma dele (= card, AC8); sem ele,
  // o resumo — os mesmos números do card "Aplicações".
  let aplicacoesDoPeriodo: ContagemDeAplicacoes | null = null;
  if (diario) {
    aplicacoesDoPeriodo = { ...diario.semData };
    for (const c of Object.values(diario.dias)) {
      aplicacoesDoPeriodo.total += c.total;
      aplicacoesDoPeriodo.pagas += c.pagas;
    }
  } else if (resumo) {
    aplicacoesDoPeriodo = { total: resumo.aplicacoes, pagas: aplicacoesPagasDoResumo(resumo.porUtmSource) };
  }

  let somaMeta: Meta | null = null;
  if (args.temCampanha) {
    somaMeta = { ...ZERO_META };
    for (const [d, m] of meta) {
      if (args.metaDesde && d < args.metaDesde) continue;
      somaMeta.spend += m.spend;
      somaMeta.impressions += m.impressions;
      somaMeta.linkClicks += m.linkClicks;
      somaMeta.lpViews += m.lpViews;
    }
  }

  const cards = args.temCampanha ? linha("", aplicacoesDoPeriodo, somaMeta) : null;
  const vazio = dias.length === 0 && !semData;
  const total = vazio ? null : (cards ?? linha("", aplicacoesDoPeriodo, null));

  return { dias, semData, total, cards, temAplicacoesPorDia };
}
