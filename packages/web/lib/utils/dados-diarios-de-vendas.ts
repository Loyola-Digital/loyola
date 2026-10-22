// Story 18.95 — "Dados diários" da etapa de Vendas: Meta das campanhas da
// etapa × vendas do Produto Principal, um dia por linha.
//
// As fórmulas são as dos cards do topo (`SalesMetaKpis`), aplicadas ao dia:
//   Investimento = spend com o imposto Meta (sumMetaInsights)
//   CPV          = investimento ÷ vendas PAGAS
//   ROAS         = faturamento PAGO ÷ investimento
//   Ticket médio = faturamento ÷ vendas
//   CTR/CPM/CPC  = pelo clique no LINK
// O Total soma as aditivas e recalcula as derivadas a partir das somas (regra da
// 18.62, nunca média) — por isso o Total bate com os cards.
//
// Fonte das vendas por dia:
//   - API ≥ contrato 56: `diarioDeVendas`, somado no mesmo laço do card, com o
//     balde das vendas sem data (linha "Sem data", AC5b).
//   - API anterior: `ingressosByDay` + `faturamentoTotalByDay`. Sem faturamento
//     pago por dia → ROAS "—"; sem balde de sem data → sem a linha.

import type { DiaDeVendas, StageSalesData } from "@loyola-x/shared";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { safeDivide, sumMetaInsights } from "@/lib/utils/funnel-metrics";
import { ordenarLinhasPorDia, type OrdemDoDia } from "@/lib/utils/ordem-do-dia";

export interface LinhaDiariaDeVendas {
  /** `aaaa-mm-dd`; vazio na linha "Sem data" e no Total. */
  date: string;
  investimento: number | null;
  vendas: number;
  vendasPago: number;
  vendasOrg: number;
  vendasSemTrack: number;
  vendasManual: number;
  faturamento: number;
  ticketMedio: number | null;
  cpv: number | null;
  roas: number | null;
  impressoes: number | null;
  cliques: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  lpViews: number | null;
  checkouts: number | null;
}

export interface DadosDiariosDeVendas {
  dias: LinhaDiariaDeVendas[];
  /** Só quando existe venda sem data (P6). */
  semData: LinhaDiariaDeVendas | null;
  total: LinhaDiariaDeVendas | null;
}

type Meta = { spend: number; impressions: number; linkClicks: number; lpViews: number; checkouts: number };

/** Vendas de um dia; `faturamentoPago` ausente = API anterior. */
type Vendas = Omit<DiaDeVendas, "faturamentoPago"> & { faturamentoPago?: number };

function linha(date: string, v: Vendas, meta: Meta | null): LinhaDiariaDeVendas {
  const vendas = v.pago + v.org + v.semTrack + v.manual;
  const inv = meta ? meta.spend : null;
  return {
    date,
    investimento: inv,
    vendas,
    vendasPago: v.pago,
    vendasOrg: v.org,
    vendasSemTrack: v.semTrack,
    vendasManual: v.manual,
    faturamento: v.faturamento,
    ticketMedio: safeDivide(v.faturamento, vendas),
    cpv: inv != null && inv > 0 ? safeDivide(inv, v.pago) : null,
    roas: inv != null && v.faturamentoPago != null ? safeDivide(v.faturamentoPago, inv) : null,
    impressoes: meta ? meta.impressions : null,
    cliques: meta ? meta.linkClicks : null,
    // Em %, como o card (`sales-meta-kpis.tsx`).
    ctr: meta ? safeDivide(meta.linkClicks * 100, meta.impressions) : null,
    cpm: meta ? safeDivide(meta.spend * 1000, meta.impressions) : null,
    cpc: meta ? safeDivide(meta.spend, meta.linkClicks) : null,
    lpViews: meta ? meta.lpViews : null,
    checkouts: meta ? meta.checkouts : null,
  };
}

const VAZIO: Vendas = { pago: 0, org: 0, semTrack: 0, manual: 0, faturamento: 0, faturamentoPago: 0 };

function vendasPorDia(vendas: StageSalesData | null | undefined): {
  dias: Record<string, Vendas>;
  semData: Vendas | null;
} {
  if (!vendas) return { dias: {}, semData: null };
  if (vendas.diarioDeVendas) {
    const { dias, semData } = vendas.diarioDeVendas;
    const temSemData = semData.pago + semData.org + semData.semTrack + semData.manual > 0 || semData.faturamento !== 0;
    return { dias, semData: temSemData ? semData : null };
  }
  // API anterior ao contrato 56.
  const dias: Record<string, Vendas> = {};
  for (const [d, c] of Object.entries(vendas.ingressosByDay ?? {})) {
    dias[d] = { pago: c.pago, org: c.org, semTrack: c.semTrack, manual: c.manual ?? 0, faturamento: 0 };
  }
  for (const [d, f] of Object.entries(vendas.faturamentoTotalByDay ?? {})) {
    dias[d] = { ...(dias[d] ?? { pago: 0, org: 0, semTrack: 0, manual: 0, faturamento: 0 }), faturamento: f };
  }
  return { dias, semData: null };
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
    out.set(d, { spend: s.spend, impressions: s.impressions, linkClicks: s.linkClicks, lpViews: s.lpViews, checkouts: s.checkoutInitiations });
  }
  return out;
}

export function montarDadosDiariosDeVendas(args: {
  /** `useCampaignDailyInsightsBulk` das campanhas da etapa. */
  meta: readonly CampaignDailyInsight[] | null | undefined;
  /** Etapa sem campanha vinculada → colunas Meta em "—" (P5). */
  temCampanha: boolean;
  /** `useStageSalesData(…, "main_product,tmb")` (com o fallback `sales` do card). */
  vendas: StageSalesData | null | undefined;
  ordem?: OrdemDoDia;
}): DadosDiariosDeVendas {
  const meta = args.temCampanha ? metaPorDia(args.meta) : new Map<string, Meta>();
  const { dias: vendas, semData } = vendasPorDia(args.vendas);
  const temPagoPorDia = !!args.vendas?.diarioDeVendas;

  const datas = new Set<string>();
  for (const [d, m] of meta) if (m.spend > 0) datas.add(d);
  for (const [d, v] of Object.entries(vendas)) {
    if (v.pago + v.org + v.semTrack + v.manual > 0 || v.faturamento !== 0) datas.add(d);
  }

  const zeroMeta: Meta = { spend: 0, impressions: 0, linkClicks: 0, lpViews: 0, checkouts: 0 };
  const dias = ordenarLinhasPorDia(
    [...datas].map((d) =>
      linha(
        d,
        vendas[d] ?? (temPagoPorDia ? VAZIO : { ...VAZIO, faturamentoPago: undefined }),
        args.temCampanha ? (meta.get(d) ?? zeroMeta) : null,
      ),
    ),
    args.ordem,
  );
  const linhaSemData = semData ? linha("", semData, null) : null;

  if (dias.length === 0 && !linhaSemData) return { dias, semData: null, total: null };

  // Total: aditivas somadas (dias + sem data), derivadas recalculadas.
  const soma: Vendas = { pago: 0, org: 0, semTrack: 0, manual: 0, faturamento: 0, faturamentoPago: temPagoPorDia ? 0 : undefined };
  for (const v of [...[...datas].map((d) => vendas[d]).filter(Boolean), ...(semData ? [semData] : [])]) {
    soma.pago += v.pago;
    soma.org += v.org;
    soma.semTrack += v.semTrack;
    soma.manual += v.manual;
    soma.faturamento += v.faturamento;
    if (soma.faturamentoPago != null) soma.faturamentoPago += v.faturamentoPago ?? 0;
  }
  let somaMeta: Meta | null = null;
  if (args.temCampanha) {
    somaMeta = { ...zeroMeta };
    for (const d of datas) {
      const m = meta.get(d);
      if (!m) continue;
      somaMeta.spend += m.spend;
      somaMeta.impressions += m.impressions;
      somaMeta.linkClicks += m.linkClicks;
      somaMeta.lpViews += m.lpViews;
      somaMeta.checkouts += m.checkouts;
    }
  }

  return { dias, semData: linhaSemData, total: linha("", soma, somaMeta) };
}
