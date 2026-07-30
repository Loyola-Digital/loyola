"use client";

/**
 * META ADS — TESTE (aba da Captação Paga). Re-skin do dashboard de Meta Ads no
 * visual da referência (maycofix): cards KPI com barra-gradiente + glow + mini-
 * barra animada, barra de consistência com shimmer, gráficos com cor CONDICIONAL,
 * tabela mono — mas RECOLORIDO 100% pra paleta Loyola (ouro/âmbar/laranja quentes
 * + esmeralda coesa pro positivo; SEM amarelo→verde) e com a logo de fundo.
 *
 * PARIDADE: puxa os MESMOS hooks do LaunchDashboard (useCrossedFunnelMetrics +
 * deps), então os números batem exatamente com o Meta Ads real.
 *
 * Leva 1: topo (KPIs completos + resumo diário: leads/ingressos, CPL, spend,
 * tabela). Próximas levas: criativos, LPs, donuts, funil, pesquisa, vendas,
 * comparação — reestilizados.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode, type ReactElement, type ComponentType } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  LabelList,
} from "recharts";
import { FlaskConical, ImageIcon, Sparkles, LayoutTemplate, PieChart as PieChartIcon, ClipboardList, Activity, ArrowLeftRight, Banknote, Users, Table2 } from "lucide-react";
import { useTrafficOverview, useTrafficCampaigns, useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { useStageSalesByDay } from "@/lib/hooks/use-stage-sales-by-day";
import { useStageHotColdBuyers } from "@/lib/hooks/use-stage-hot-cold-buyers";
import { useSurveyAggregation } from "@/lib/hooks/use-survey-aggregation";
import { useLpPerformanceData } from "@/lib/hooks/useLpPerformanceData";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { expandChartDataV2, calculateProjectionPercentage } from "@/lib/utils/lead-trend-calculations";
import { useLeadsProjection } from "@/lib/hooks/use-leads-projection";
import {
  useFunnelBatchTurns,
  useCreateFunnelBatchTurn,
  useUpdateFunnelBatchTurn,
  useDeleteFunnelBatchTurn,
  type FunnelBatchTurn,
} from "@/lib/hooks/use-funnel-batch-turns";
import { useMetaAdsComparison } from "@/lib/hooks/use-meta-ads-comparison";
import { useFunnelAdsetsMap } from "@/lib/hooks/use-funnel-adsets-map";
import { overrideCplWithUniqueIngressos, type DailyRow } from "@/lib/utils/funnel-metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { StageCreativePerformanceTable } from "./stage-creative-performance-table";
import { TopCreativesGallery } from "./top-creatives-gallery";
import { SurveyQualificationSection } from "./survey-qualification-section";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelLeadsFormula,
  buildFunnelCplFormula,
  buildFunnelConnectRateFormula,
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  buildFunnelCpmFormula,
  buildFunnelSurveyFormula,
} from "@/lib/formulas/funnels";
import type { MetricFormula } from "@/lib/types/metric-formula";
import { StageSalesSection } from "./stage-sales-section";
import { GroupsDashboardSection } from "./groups-dashboard-section";
import { CtrCpmChart, SaturationBadge, FunnelComparisonChart } from "./launch-dashboard";
import { LeadsByUtmTable } from "./leads-by-utm-table";
import { RefreshDataButton } from "./refresh-data-button";
import { MetaFreshnessBadge } from "./meta-freshness-badge";
import { LpPerformanceTable } from "@/lib/components/funnels/lp-performance-table";
import type { Funnel, StageType } from "@loyola-x/shared";

// ---- paleta Loyola (estrutura do ref, cores nossas) ----
const T = {
  bg: "#0b0b12",
  surface: "#15151d",
  surface2: "#1c1c27",
  border: "rgba(255,255,255,.07)",
  gold: "#fdd449",
  amber: "#f59e0b",
  orange: "#fb923c",
  emerald: "#10b981",
  teal: "#0d9488",
  red: "#ef4444",
  text: "#eef2f7",
  muted: "#7b8494",
  muted2: "#a9b2c0",
  grid: "rgba(255,255,255,.04)",
};
// header quente, Loyola, sem verde
const GRAD = `linear-gradient(135deg, ${T.gold} 0%, ${T.amber} 50%, ${T.orange} 100%)`;
const G = {
  goldAmber: `linear-gradient(135deg,${T.gold},${T.amber})`,
  amberOrange: `linear-gradient(135deg,${T.amber},${T.orange})`,
  goldOrange: `linear-gradient(135deg,${T.gold},${T.orange})`,
  emeraldTeal: `linear-gradient(135deg,${T.emerald},${T.teal})`, // verde coeso
  amberRed: `linear-gradient(135deg,${T.amber},${T.red})`,
};

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const int = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

// dinheiro sem centavos (igual print: "R$ 40.103")
const money0 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// estilos compartilhados dos gráficos (dark/mono)
const MONO_TICK = { fontSize: 10, fill: "#a9b2c0", fontFamily: "'JetBrains Mono',monospace" };
const TT_STYLE = { background: "#1c1c27", border: "1px solid rgba(255,255,255,.07)", borderRadius: 8, fontSize: 12, color: "#eef2f7" };
const dmLabel = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ---- Tooltips ricos (estilo TESTE) + label de valor nos pontos ----
const tnum = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
// render function de label de valor acima do ponto/barra (via <LabelList content>).
// Só é montado quando !dense (poucos dias), pra não poluir.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ptLabelFn(fmt: (v: number) => string): (props: any) => ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    const { x, y, value } = props ?? {};
    const n = Number(value);
    if (x == null || y == null || !n) return <g />;
    return <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill={T.muted2} fontFamily="'JetBrains Mono',monospace">{fmt(n)}</text>;
  };
}

function TipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, minWidth: 160 }}>
      <div style={{ color: T.text, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function TipRow({ l, v, c }: { l: string; v: string; c?: string }) {
  return <div className="flex justify-between gap-4" style={{ color: c ?? T.muted2 }}><span>{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
}
// leads/CPL/investimento por dia (hero) — usa o item de derived.chart.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeroTip({ active, payload, isPaid }: any) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <TipShell title={String(d.label)}>
      <TipRow l={isPaid ? "Ingressos" : "Leads"} v={int(tnum(d.leads))} c={T.emerald} />
      <TipRow l="CPL" v={d.cpl == null ? "—" : brl(tnum(d.cpl))} />
      <TipRow l="Investimento" v={brl(tnum(d.spend))} c={T.gold} />
    </TipShell>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CplCompTip({ active, payload }: any) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <TipShell title={String(d.label)}>
      <TipRow l="Investimento" v={brl(tnum(d.spend))} c={T.gold} />
      <TipRow l="CPL Pago" v={d.cplPago == null ? "—" : brl(tnum(d.cplPago))} c={T.gold} />
      <TipRow l="CPL Geral" v={d.cplGeral == null ? "—" : brl(tnum(d.cplGeral))} c={T.emerald} />
    </TipShell>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AcumTip({ active, payload, isPaid }: any) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const t = isPaid ? "Ingressos" : "Leads";
  return (
    <TipShell title={String(d.label)}>
      <TipRow l={`${t} total`} v={int(tnum(d.total))} c={T.gold} />
      <TipRow l="Pago" v={int(tnum(d.pago))} c={T.emerald} />
      <TipRow l="Org" v={int(tnum(d.org))} c={T.teal} />
      <TipRow l="s/ Track" v={int(tnum(d.semTrack))} c={T.amber} />
    </TipShell>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTip({ active, payload }: any) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const proj = Boolean(d.isProjection);
  return (
    <TipShell title={String(d.label)}>
      <TipRow l={proj ? "🔮 Projetado" : "✓ Real"} v="" c={proj ? T.amber : T.emerald} />
      <TipRow l="Acumulado" v={int(tnum(d.cumulative))} />
      <TipRow l="Por dia" v={int(tnum(proj ? d.dailyProjected : d.dailyReal))} />
      {proj && d.bandUpper != null ? <TipRow l="Banda" v={`±${int(tnum(d.bandUpper) - tnum(d.cumulative))}`} /> : null}
      <TipRow l="Meta" v={int(tnum(d.meta))} c={T.red} />
    </TipShell>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CostTip({ active, payload }: any) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const proj = Boolean(d.isProjection);
  return (
    <TipShell title={String(d.label)}>
      <TipRow l={proj ? "🔮 Projetado" : "✓ Real"} v="" c={proj ? T.amber : T.emerald} />
      <TipRow l="Pagos/dia" v={int(tnum(proj ? d.dailyProjectedPaid : d.dailyRealPaid))} />
      <TipRow l="Org/dia" v={int(tnum(proj ? d.dailyProjectedOrg : d.dailyRealOrg))} />
      <TipRow l="Acumulado" v={int(tnum(d.cumulative))} />
      {d.cplProjected != null ? <TipRow l="CPL proj." v={brl(tnum(d.cplProjected))} c={T.amber} /> : null}
      <TipRow l="Meta" v={int(tnum(d.metaCumulative))} c={T.red} />
    </TipShell>
  );
}

// Estilo da linha de marco (acima do dia): virada pra frente (verde), retorno
// (âmbar) ou fase/separador (roxo). Detecta pelo texto do label do batch turn.
function turnStyle(label: string): { color: string; bg: string; prefix: string } {
  const l = label.toLowerCase();
  if (/retorno|volta|↩/.test(l)) return { color: T.amber, bg: "rgba(245,158,11,.12)", prefix: "↩" };
  if (label.trim().startsWith("—") || /\bfase\b/.test(l)) return { color: T.muted2, bg: "rgba(124,58,237,.14)", prefix: "—" };
  return { color: T.emerald, bg: "rgba(16,185,129,.12)", prefix: "⇢" };
}

interface Kpi {
  l: string;
  v: string;
  s?: string;
  g: string;
  fill: number;
  formula?: MetricFormula;
}

export function MetaAdsTesteTab({
  funnel,
  projectId,
  stageId,
  stageType,
}: {
  funnel: Funnel;
  projectId: string;
  stageId?: string;
  stageType?: StageType;
}) {
  const [days, setDays] = useState(90);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const isPaid = stageType === "paid";

  // ---- MESMOS hooks do LaunchDashboard (paridade de números) ----
  const { data: overview } = useTrafficOverview(projectId, days, campaignIds.length > 0 ? campaignIds : null);
  const { data: salesDataRaw } = useStageSalesData(
    isPaid ? projectId : null, isPaid ? funnel.id : null, isPaid ? (stageId ?? null) : null, "capture", days,
  );
  const { data: salesByDayRaw } = useStageSalesByDay(
    isPaid ? projectId : null, isPaid ? funnel.id : null, isPaid ? (stageId ?? null) : null, days,
  );
  const salesByDay = salesByDayRaw && !salesByDayRaw.semDados ? salesByDayRaw.byDay : null;
  const salesData = salesDataRaw && !salesDataRaw.semDados ? salesDataRaw : undefined;
  const metrics = useCrossedFunnelMetrics(
    projectId, funnel, days, stageId ?? null,
    salesDataRaw && !salesDataRaw.semDados ? salesDataRaw : null, salesByDay,
  );
  const survey = useSurveyAggregation(projectId, funnel.id, stageId ?? null);
  const { data: campaignData } = useTrafficCampaigns(projectId, days);
  const { data: stageHotColdBuyers } = useStageHotColdBuyers(
    isPaid ? projectId : null, isPaid ? funnel.id : null, isPaid ? (stageId ?? null) : null, "capture", days,
  );
  const { data: dailyData, isLoading: dailyLoading } = useCampaignDailyInsightsBulk(
    projectId, campaignIds.length > 0 ? campaignIds : null, days,
  );
  const { data: compData } = useMetaAdsComparison(projectId, funnel.id, stageId ?? null, funnel.compareFunnelId, days);
  const { adsetsMap } = useFunnelAdsetsMap(projectId, campaignIds, days);
  const hasComparison = !!(compData && !compData.semDados);
  const compDays = hasComparison ? compData!.days : null;

  // Viradas de lote (linha de marco acima do dia) — mesmo backend da tabela original.
  const batchTurns = useFunnelBatchTurns(projectId, funnel.id);
  const createTurn = useCreateFunnelBatchTurn(projectId, funnel.id);
  const updateTurn = useUpdateFunnelBatchTurn(projectId, funnel.id);
  const deleteTurn = useDeleteFunnelBatchTurn(projectId, funnel.id);
  const turnsByDate = useMemo(() => {
    const m = new Map<string, FunnelBatchTurn>();
    (batchTurns.data ?? []).forEach((t) => m.set(t.date, t));
    return m;
  }, [batchTurns.data]);

  // Observação por dia (campo dayNotes da etapa) — Controle Diário.
  const { data: stageData } = useFunnelStage(projectId, funnel.id, stageId ?? "");
  const updateStageNotes = useUpdateStage(projectId, funnel.id, stageId ?? "");
  const dayNotes = stageData?.dayNotes ?? {};
  const saveNote = (date: string, text: string) => {
    updateStageNotes.mutate({ dayNotes: { ...dayNotes, [date]: text } });
  };

  // ingressos únicos sobrescrevem leads na Paga (mesma regra do dash)
  const ingUnicosByDay = isPaid ? salesData?.ingressosUnicosByDay : undefined;
  const paidRows = useMemo<DailyRow[]>(() => {
    if (!ingUnicosByDay) return metrics.rows;
    return metrics.rows.map((r) => {
      const iu = ingUnicosByDay[r.date];
      const pagos = iu ? iu.pago : 0;
      const org = iu ? iu.org : 0;
      const semTrack = iu ? iu.semTrack : 0;
      return { ...overrideCplWithUniqueIngressos(r, pagos, pagos + org + semTrack), leadsPagos: pagos, leadsOrg: org, leadsSemTrack: semTrack };
    });
  }, [metrics.rows, ingUnicosByDay]);
  const paidTotals = useMemo<DailyRow>(() => {
    if (!ingUnicosByDay) return metrics.totals;
    const all = Object.values(ingUnicosByDay);
    const pagos = all.reduce((s, v) => s + v.pago, 0);
    const totais = all.reduce((s, v) => s + v.pago + v.org + v.semTrack, 0);
    return overrideCplWithUniqueIngressos(metrics.totals, pagos, totais);
  }, [metrics.totals, ingUnicosByDay]);

  // séries diárias (exclui a linha "Total" caso venha)
  const rows = useMemo(() => paidRows.filter((r) => r.date && r.date !== "Total"), [paidRows]);

  const derived = useMemo(() => {
    const leadsOf = (r: DailyRow) => r.leadsPagos + r.leadsOrg + r.leadsSemTrack;
    const withLeads = rows.filter((r) => leadsOf(r) > 0);
    const avgLeads = withLeads.length > 0 ? withLeads.reduce((s, r) => s + leadsOf(r), 0) / withLeads.length : 0;
    const cplValid = rows.filter((r) => r.cplG != null) as (DailyRow & { cplG: number })[];
    const avgCpl = cplValid.length > 0 ? cplValid.reduce((s, r) => s + r.cplG, 0) / cplValid.length : null;
    const daysAboveAvg = rows.filter((r) => leadsOf(r) >= avgLeads).length;
    const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
    const maxLeads = Math.max(...rows.map(leadsOf), 1);
    const chart = rows.map((r) => ({
      label: r.date.slice(8, 10) + "/" + r.date.slice(5, 7),
      date: r.date,
      leads: leadsOf(r),
      cpl: r.cplG,
      cplPago: r.cplPg,
      cplGeral: r.cplG,
      spend: r.spend,
      meta: avgLeads,
    }));
    // acumulado por origem (curva de ingressos/leads acumulados)
    let cumP = 0, cumO = 0, cumS = 0;
    const cumulative = rows.map((r) => {
      cumP += r.leadsPagos;
      cumO += r.leadsOrg;
      cumS += r.leadsSemTrack;
      return {
        label: r.date.slice(8, 10) + "/" + r.date.slice(5, 7),
        date: r.date,
        pago: cumP,
        org: cumO,
        semTrack: cumS,
        total: cumP + cumO + cumS,
      };
    });
    return { leadsOf, avgLeads, avgCpl, daysAboveAvg, maxSpend, maxLeads, chart, cumulative };
  }, [rows]);

  if (campaignIds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center text-sm text-muted-foreground">
        <FlaskConical className="mx-auto mb-2 h-6 w-6 text-amber-400" />
        Vincule campanhas Meta a esta etapa (aba Meta Ads → Configurar) pra ver o experimento.
      </div>
    );
  }

  const loading = metrics.isLoading;
  const campaignIdSet = new Set(campaignIds);
  const funnelCampaigns = (campaignData?.campaigns ?? []).filter((c) => campaignIdSet.has(c.campaignId));
  // Distribuição de investimento Hot/Cold/Outros (por nome da campanha).
  const spendHotCold = funnelCampaigns.reduce(
    (acc, c) => {
      const n = c.campaignName.toLowerCase();
      const cat = n.includes("hot") ? "hot" : n.includes("cold") ? "cold" : "outros";
      acc[cat] += c.spend;
      return acc;
    },
    { hot: 0, cold: 0, outros: 0 },
  );

  // ---- KPIs (paridade com o dash) ----
  const sumOrigem = (v?: { pago: number; org: number; semTrack: number }) => (v ? v.pago + v.org + v.semTrack : 0);
  const sumAllOrigem = (rec?: Record<string, { pago: number; org: number; semTrack: number }>) =>
    rec ? Object.values(rec).reduce((s, v) => s + sumOrigem(v), 0) : 0;
  const sumAllNum = (rec?: Record<string, number>) => (rec ? Object.values(rec).reduce((s, v) => s + v, 0) : 0);
  const showFaturamento = isPaid && !!stageId && !!salesData;
  const ingressosUnicosCard = sumAllOrigem(salesData?.ingressosUnicosByDay);
  const ingressosTotaisCard = sumAllOrigem(salesData?.ingressosTotaisByDay);
  const faturamentoTotalCard = sumAllNum(salesData?.faturamentoTotalByDay);
  const faturamentoUnicoCard = sumAllNum(salesData?.faturamentoUnicoByDay);
  const surveyResponseRate =
    survey && survey.matchedResponses > 0 && metrics.totalLeads > 0
      ? Math.min((survey.matchedResponses / metrics.totalLeads) * 100, 100)
      : null;

  const f = { days, funnelType: "launch" as const, funnelName: funnel.name };
  const kpis: Kpi[] = [];
  kpis.push({ l: "Investimento", v: brl(metrics.spend), s: `${rows.length} dias`, g: G.goldAmber, fill: 100, formula: buildFunnelSpendFormula(metrics.spend, f) });
  if (showFaturamento) {
    kpis.push({ l: "Faturamento Total", v: brl(faturamentoTotalCard), s: `único ${brl(faturamentoUnicoCard)}`, g: G.emeraldTeal, fill: 100 });
  }
  kpis.push({
    l: isPaid ? "Leads Popup" : "Leads Únicos",
    v: metrics.hasLinkedSheet ? int(metrics.totalLeads) : "—",
    s: metrics.hasLinkedSheet ? `pg ${int(metrics.leadsPagos)} · org ${int(metrics.leadsOrg)} · s/t ${int(metrics.leadsSemTrack)}` : "vincule planilha",
    g: G.goldOrange,
    fill: 100,
    formula: metrics.hasLinkedSheet ? buildFunnelLeadsFormula(metrics.totalLeads, f, { pagos: metrics.leadsPagos, org: metrics.leadsOrg, semTrack: metrics.leadsSemTrack }) : undefined,
  });
  if (isPaid && metrics.totalVendas !== null) {
    kpis.push({
      l: "Venda Ingressos Únicos",
      v: int(showFaturamento ? ingressosUnicosCard : metrics.totalVendas),
      s: showFaturamento ? `ingr+bump ${int(ingressosTotaisCard)}` : undefined,
      g: G.emeraldTeal,
      fill: 100,
    });
  }
  const cplPagoVal = isPaid ? paidTotals.cplPg : metrics.cplPago;
  const cplGeralVal = isPaid ? paidTotals.cplG : metrics.cplGeral;
  kpis.push({
    l: isPaid ? "CPL Pago Único" : "CPL Pago",
    v: metrics.hasLinkedSheet ? brl(cplPagoVal) : "—",
    s: metrics.hasLinkedSheet ? `${isPaid ? "geral único" : "geral"} ${brl(cplGeralVal)}` : "vincule planilha",
    g: G.amberRed,
    fill: 60,
    formula: metrics.hasLinkedSheet && !isPaid ? buildFunnelCplFormula(metrics.spend, metrics.leadsPagos, f, "pago") : undefined,
  });
  kpis.push({ l: "Connect Rate", v: pct(metrics.connectRate), s: "LP views ÷ cliques", g: G.goldAmber, fill: Math.min(100, metrics.connectRate ?? 0), formula: buildFunnelConnectRateFormula(metrics.connectRate, f) });
  kpis.push({ l: "CTR (link)", v: pct(metrics.ctr), s: overview ? `${int(overview.totalLinkClicks)} cliques` : undefined, g: G.goldOrange, fill: Math.min(100, (metrics.ctr ?? 0) * 25), formula: buildFunnelCtrFormula(metrics.ctr, f) });
  kpis.push({ l: "CPC (link)", v: brl(metrics.cpc), s: "spend ÷ cliques", g: G.amberOrange, fill: 55, formula: buildFunnelCpcFormula(metrics.cpc, f) });
  kpis.push({ l: "CPM", v: brl(metrics.cpm), s: overview ? `${int(overview.totalImpressions)} impr.` : undefined, g: G.amberRed, fill: 45, formula: buildFunnelCpmFormula(metrics.cpm, f) });
  if (isPaid && metrics.checkoutConversionRate !== null) {
    kpis.push({ l: "Taxa Checkout", v: pct(metrics.checkoutConversionRate), s: metrics.vendasPago != null && metrics.checkoutVisits ? `${int(metrics.vendasPago)} ÷ ${int(metrics.checkoutVisits)}` : undefined, g: G.emeraldTeal, fill: Math.min(100, metrics.checkoutConversionRate) });
  }
  if (surveyResponseRate !== null && survey) {
    kpis.push({ l: "Pesquisa", v: `${surveyResponseRate.toFixed(1)}%`, s: `${int(survey.matchedResponses)} match · ${int(survey.unmatchedResponses)} s/ match`, g: G.goldAmber, fill: Math.min(100, surveyResponseRate), formula: buildFunnelSurveyFormula(survey.matchedResponses, metrics.totalLeads) });
  }

  const consistencyPct = rows.length > 0 ? Math.round((derived.daysAboveAvg / rows.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  // Clique direito num dia: marca / edita (vazio remove) a virada de lote.
  const markTurn = (date: string) => {
    const label = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    const turn = turnsByDate.get(date);
    if (turn) {
      const next = window.prompt(`Editar virada de lote em ${label} (vazio remove):`, turn.label);
      if (next == null) return;
      if (next.trim() === "") deleteTurn.mutate(turn.id);
      else if (next.trim() !== turn.label) updateTurn.mutate({ id: turn.id, label: next.trim() });
    } else {
      const l = window.prompt(`Virada de lote em ${label}\nLabel (ex: "Virada para Lote 02", "Fase 1: Abertura", "Retorno ao Lote 01"):`, "");
      if (l && l.trim()) createTurn.mutate({ date, label: l.trim() });
    }
  };

  const editNote = (date: string) => {
    const label = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    const next = window.prompt(`Observação de ${label} (vazio remove):`, dayNotes[date] ?? "");
    if (next != null) saveNote(date, next.trim());
  };

  // Controle Diário — 1 linha por dia (crescente), com financeiro derivado.
  const fatByDay = salesData?.faturamentoTotalByDay;
  const totaisByDay = salesData?.ingressosTotaisByDay;
  let acumIngressos = 0;
  const controleRows = rows.map((r) => {
    const ingressos = derived.leadsOf(r);
    acumIngressos += ingressos;
    const td = totaisByDay?.[r.date];
    const totais = td ? td.pago + td.org + td.semTrack : null;
    const bumps = totais != null ? Math.max(0, totais - ingressos) : null;
    const pctBump = bumps != null && ingressos > 0 ? (bumps / ingressos) * 100 : null;
    const fat = fatByDay ? (fatByDay[r.date] ?? 0) : null;
    const invest = r.spend;
    const cpa = ingressos > 0 ? invest / ingressos : null;
    const lucro = fat != null ? fat - invest : null;
    const roi = lucro != null && invest > 0 ? (lucro / invest) * 100 : null;
    const lucrativo = lucro != null ? lucro >= 0 : ingressos >= derived.avgLeads;
    return { date: r.date, ingressos, bumps, pctBump, fat, invest, cpa, lucro, roi, acum: acumIngressos, lucrativo, obs: dayNotes[r.date] ?? "", turn: turnsByDate.get(r.date) };
  });

  return (
    <div className="space-y-3">
      {/* header: refresh + freshness + seletor de período (refetch por days) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RefreshDataButton />
          <MetaFreshnessBadge projectId={projectId} />
        </div>
        <div className="inline-flex rounded-lg border border-border/50 p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 transition-colors ${days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300..800&family=JetBrains+Mono:wght@300..500&display=swap" />
      <style>{`
        @keyframes mat-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.8)} }
        @keyframes mat-sh { 0%{opacity:0;transform:translateX(-100%)} 50%{opacity:1} 100%{opacity:0;transform:translateX(100%)} }
        .mat-kpi { position:relative; overflow:hidden; background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:17px 15px; transition:border-color .2s, transform .2s; }
        .mat-kpi:hover { border-color:rgba(255,255,255,.13); transform:translateY(-2px); }
        .mat-kpi-glow { position:absolute; top:-24px; right:-18px; width:90px; height:90px; border-radius:50%; filter:blur(22px); opacity:.12; pointer-events:none; }
        .mat-bf { height:3px; border-radius:99px; transition:width 1.4s cubic-bezier(.4,0,.2,1); }
        .mat-bar-fill { position:relative; overflow:hidden; height:10px; border-radius:99px; background:linear-gradient(90deg,${T.amber},${T.gold},${T.orange}); transition:width 1.6s cubic-bezier(.4,0,.2,1); }
        .mat-bar-fill::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent); animation:mat-sh 2.5s infinite; }
        .mat-ct::after { content:""; flex:1; height:1px; margin-left:10px; background:linear-gradient(90deg,rgba(255,255,255,.14),transparent); }
        @media (prefers-reduced-motion: reduce) { .mat-bf,.mat-bar-fill{transition:none} .mat-bar-fill::after{animation:none} .mat-dot{animation:none !important} }
      `}</style>

      <div className="relative overflow-hidden rounded-2xl border p-5 sm:p-7 space-y-6" style={{ background: T.bg, borderColor: T.border, color: T.text, fontFamily: "'Outfit',sans-serif" }}>
        {/* Logo Loyola em marca d'água — metade da tela, bem opaca */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-no-repeat opacity-[0.06] md:block" style={{ backgroundImage: "url('/logo.svg')", backgroundPosition: "center right", backgroundSize: "contain" }} />
        {/* Glows brand (quentes) */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{
          background:
            `radial-gradient(600px 300px at 15% 0%, rgba(253,212,73,.10), transparent),` +
            `radial-gradient(520px 260px at 85% 8%, rgba(251,146,60,.09), transparent),` +
            `radial-gradient(700px 320px at 50% 100%, rgba(245,158,11,.08), transparent)`,
        }} />

        <div className="relative space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest" style={{ borderColor: "rgba(253,212,73,.35)", background: "rgba(253,212,73,.12)", color: T.gold, fontFamily: "'JetBrains Mono',monospace" }}>
                <span className="mat-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: T.gold, animation: "mat-pulse 2s infinite" }} />
                experimento visual
              </span>
              <h2 className="mt-2 leading-none" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(32px,4.5vw,54px)", letterSpacing: "4px", fontWeight: 400 }}>
                META ADS{" "}
                <em style={{ fontStyle: "normal", background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>TESTE</em>
              </h2>
            </div>
            <span className="text-[10px]" style={{ color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>mesmos dados do Meta Ads · spend com imposto</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" style={{ background: T.surface }} />)}
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {kpis.map((k) => (
                  <MetricTooltip key={k.l} label={k.l} value={k.v} formula={k.formula}>
                    <div className={`mat-kpi ${k.formula ? "cursor-help" : ""}`}>
                      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-[12px]" style={{ background: k.g }} />
                      <div className="mat-kpi-glow" style={{ background: k.g }} />
                      <p className="text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{k.l}</p>
                      <p className="mt-1 font-extrabold" style={{ fontSize: "clamp(17px,2.1vw,26px)", textDecoration: k.formula ? "underline dotted" : undefined, textUnderlineOffset: 4, textDecorationColor: "rgba(255,255,255,.25)" }}>{k.v}</p>
                      {k.s && <p className="mt-0.5 text-[10px]" style={{ color: T.muted2 }}>{k.s}</p>}
                      <div className="mt-2 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
                        <div className="mat-bf" style={{ background: k.g, width: `${Math.max(4, Math.min(100, k.fill))}%` }} />
                      </div>
                    </div>
                  </MetricTooltip>
                ))}
              </div>

              {/* Consistência (shimmer) */}
              {metrics.hasLinkedSheet && rows.length > 0 && (
                <div className="rounded-[12px] border p-4" style={{ background: T.surface, borderColor: T.border }}>
                  <div className="mb-2 flex items-center justify-between text-[10px] uppercase" style={{ letterSpacing: "1px" }}>
                    <span style={{ color: T.muted }}>Consistência — dias com {isPaid ? "ingressos" : "leads"} ≥ média ({derived.avgLeads.toFixed(1)}/dia)</span>
                    <span style={{ color: T.emerald, fontFamily: "'JetBrains Mono',monospace" }}>{derived.daysAboveAvg}/{rows.length} dias · {consistencyPct}%</span>
                  </div>
                  <div className="h-[10px] rounded-full" style={{ background: "rgba(255,255,255,.055)" }}>
                    <div className="mat-bar-fill" style={{ width: `${consistencyPct}%` }} />
                  </div>
                </div>
              )}

              {/* Charts: leads/dia + CPL/dia */}
              {metrics.hasLinkedSheet && rows.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
                  <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                    <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>
                      {isPaid ? "Ingressos" : "Leads"} por dia — verde ≥ média · vermelho abaixo · fantasma ouro = média
                    </p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={derived.chart} barGap={2}>
                        <CartesianGrid stroke={T.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                        <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={34} />
                        <Tooltip content={<HeroTip isPaid={isPaid} />} />
                        <Bar dataKey="meta" fill="rgba(253,212,73,.13)" stroke="rgba(253,212,73,.4)" strokeWidth={1} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="leads" radius={[3, 3, 0, 0]}>
                          {derived.chart.map((r) => <Cell key={r.date} fill={r.leads >= derived.avgLeads ? "rgba(16,185,129,.55)" : "rgba(239,68,68,.5)"} />)}
                          <LabelList content={ptLabelFn(int)} />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                    <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>CPL {isPaid ? "geral" : ""} diário — vermelho acima da média</p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={derived.chart}>
                        <CartesianGrid stroke={T.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                        <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={40} />
                        <Tooltip content={<HeroTip isPaid={isPaid} />} />
                        <Area dataKey="cpl" stroke="none" fill="rgba(245,158,11,.08)" connectNulls />
                        <Line dataKey="cpl" type="monotone" stroke={T.amber} strokeWidth={2} connectNulls
                          dot={(p: { cx?: number; cy?: number; payload?: { cpl?: number | null }; index?: number }) => {
                            const above = derived.avgCpl != null && p.payload?.cpl != null && p.payload.cpl > derived.avgCpl;
                            return <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={above ? T.red : T.amber} stroke="none" />;
                          }}
                        >
                          <LabelList content={ptLabelFn(brl)} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Investimento por dia */}
              {rows.length > 0 && (
                <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                  <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>Investimento por dia (com imposto)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={derived.chart}>
                      <defs>
                        <linearGradient id="mat-spend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.gold} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={T.gold} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={T.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                      <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={44} tickFormatter={(v) => `R$${Math.round(v)}`} />
                      <Tooltip content={<HeroTip isPaid={isPaid} />} />
                      <Area dataKey="spend" type="monotone" stroke={T.gold} strokeWidth={2} fill="url(#mat-spend)"><LabelList content={ptLabelFn(brl)} /></Area>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Leva 5a: CPL Pago×Geral + Ingressos Acumulados */}
              {metrics.hasLinkedSheet && rows.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                    <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>
                      CPL {isPaid ? "único " : ""}— pago (ouro) vs geral (esmeralda) · barra = investimento
                    </p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={derived.chart}>
                        <CartesianGrid stroke={T.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                        <YAxis yAxisId="cpl" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={40} />
                        <YAxis yAxisId="inv" orientation="right" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={44} tickFormatter={(v) => `R$${Math.round(v)}`} />
                        <Tooltip content={<CplCompTip />} />
                        <Bar yAxisId="inv" dataKey="spend" name="Investimento" fill="rgba(245,158,11,.12)" radius={[3, 3, 0, 0]} />
                        <Line yAxisId="cpl" dataKey="cplPago" name="CPL Pago" type="monotone" stroke={T.gold} strokeWidth={2} dot={{ r: 2.5, fill: T.gold, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(brl)} /></Line>
                        <Line yAxisId="cpl" dataKey="cplGeral" name="CPL Geral" type="monotone" stroke={T.emerald} strokeWidth={2} dot={{ r: 2.5, fill: T.emerald, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(brl)} /></Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                    <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>
                      {isPaid ? "Ingressos" : "Leads"} acumulados — por origem (total ouro)
                    </p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={derived.cumulative}>
                        <defs>
                          <linearGradient id="mat-cum" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.gold} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={T.gold} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={T.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                        <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={38} />
                        <Tooltip content={<AcumTip isPaid={isPaid} />} />
                        <Area dataKey="total" name="Total" type="monotone" stroke={T.gold} strokeWidth={2} fill="url(#mat-cum)" dot={{ r: 2.5, fill: T.gold, strokeWidth: 0 }}><LabelList content={ptLabelFn(int)} /></Area>
                        <Line dataKey="pago" name="Pago" type="monotone" stroke={T.emerald} strokeWidth={2} dot={{ r: 2, fill: T.emerald, strokeWidth: 0 }} />
                        <Line dataKey="org" name="Org" type="monotone" stroke={T.teal} strokeWidth={2} dot={{ r: 2, fill: T.teal, strokeWidth: 0 }} />
                        <Line dataKey="semTrack" name="s/ Track" type="monotone" stroke={T.amber} strokeWidth={2} dot={{ r: 2, fill: T.amber, strokeWidth: 0 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Leva 5b: Tendência + Meta · Projeção por Custo */}
              {metrics.hasLinkedSheet && rows.length > 0 && (
                <div className="space-y-4">
                  <TesteTrendChart rows={rows} funnel={funnel} projectId={projectId} isPaid={isPaid} />
                  <TesteCostChart rows={rows} funnel={funnel} projectId={projectId} isPaid={isPaid} />
                </div>
              )}

              {/* Controle Diário Completo */}
              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: "2px", lineHeight: 1, color: T.text }}>CONTROLE DIÁRIO COMPLETO</h3>
                    <div className="flex items-center gap-4 text-[10px]" style={{ color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>
                      <span className="inline-flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.emerald, display: "inline-block" }} />Lucrativo</span>
                      <span className="inline-flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.red, display: "inline-block" }} />Prejuízo</span>
                      <span className="inline-flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.amber, display: "inline-block" }} />Sprint / Lote</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: T.border }}>
                    <table className="w-full text-right" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: T.surface2 }}>
                          {["Dia", "St", "Ingr.", "Bumps", "% Bump", "Fat. 100%", "Invest. c/ Imp.", "CPA", "Lucro", "ROI", "Acum.", "Observação"].map((h, i) => (
                            <th key={h} className={`px-3 py-2 text-[8px] uppercase whitespace-nowrap ${i === 0 || i === 1 || h === "Observação" ? "text-left" : ""}`} style={{ color: T.muted, letterSpacing: "1px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {controleRows.map((row) => {
                          const isToday = row.date === today;
                          const st = row.turn ? turnStyle(row.turn.label) : null;
                          return (
                            <Fragment key={row.date}>
                              {row.turn && st && (
                                <tr style={{ background: st.bg, borderTop: `1px solid ${T.border}` }}>
                                  <td colSpan={12} className="px-3 py-1.5 text-left whitespace-nowrap" style={{ color: st.color, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", fontSize: 10 }}>
                                    {st.prefix} {row.turn.label}
                                  </td>
                                </tr>
                              )}
                              <tr
                                onContextMenu={(e) => { e.preventDefault(); markTurn(row.date); }}
                                title="Clique direito: marcar virada de lote / fase"
                                style={{ background: isToday ? "rgba(253,212,73,.05)" : undefined, borderTop: `1px solid ${T.border}`, borderLeft: row.turn && st ? `3px solid ${st.color}` : "3px solid transparent" }}
                              >
                                <td className="px-3 py-1.5 text-left whitespace-nowrap" style={{ color: isToday ? T.gold : T.muted2 }}>
                                  <span style={{ color: T.muted }}>{weekdayOf(row.date)}</span> {row.date.slice(8, 10)}/{row.date.slice(5, 7)}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <span style={{ display: "inline-flex", width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center", background: row.lucrativo ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)", color: row.lucrativo ? T.emerald : T.red, fontSize: 10 }}>{row.lucrativo ? "✓" : "↓"}</span>
                                </td>
                                <td className="px-3 py-1.5" style={{ color: T.emerald }}>{int(row.ingressos)}</td>
                                <td className="px-3 py-1.5" style={{ color: T.muted2 }}>{row.bumps != null ? int(row.bumps) : "—"}</td>
                                <td className="px-3 py-1.5" style={{ color: T.muted }}>{row.pctBump != null ? `${row.pctBump.toFixed(1)}%` : "—"}</td>
                                <td className="px-3 py-1.5" style={{ color: T.emerald }}>{money0(row.fat)}</td>
                                <td className="px-3 py-1.5" style={{ color: T.red }}>{money0(row.invest)}</td>
                                <td className="px-3 py-1.5" style={{ color: T.muted2 }}>{money0(row.cpa)}</td>
                                <td className="px-3 py-1.5 font-semibold" style={{ color: row.lucro == null ? T.muted2 : row.lucro >= 0 ? T.emerald : T.red }}>{money0(row.lucro)}</td>
                                <td className="px-3 py-1.5 font-semibold" style={{ color: row.roi == null ? T.muted2 : row.roi >= 0 ? T.emerald : T.red }}>{row.roi != null ? `${row.roi.toFixed(1)}%` : "—"}</td>
                                <td className="px-3 py-1.5" style={{ color: T.muted2 }}>{int(row.acum)}</td>
                                <td className="px-3 py-1.5 text-left" style={{ color: row.obs ? T.muted2 : T.muted, cursor: "pointer", minWidth: 180, maxWidth: 320 }}
                                  onClick={() => editNote(row.date)} title="Clique pra editar a observação">
                                  {row.obs || <span style={{ opacity: 0.45 }}>+ obs</span>}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px]" style={{ color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>
                    Clique na coluna Observação pra anotar o dia · clique direito num dia pra marcar virada de lote / fase (aparece como linha acima). Fat.=faturamento total · Invest.=spend c/ imposto · Lucro=Fat−Invest · Bumps=ingressos totais−únicos.
                  </p>
                </div>
              )}

              {/* Leva 5c: Leads & vendas por UTM */}
              {metrics.hasLinkedSheet && (
                <div className="space-y-4">
                  <GroupHeading icon={Table2} title="LEADS & VENDAS POR UTM" subtitle="Agrupado por source / medium / campaign / content / term" />
                  <LeadsByUtmTable projectId={projectId} funnelId={funnel.id} stageId={stageId} days={days} />
                </div>
              )}

              {/* ---- Leva 2: Criativos + LPs (componentes reais em moldura estilizada) ---- */}
              {isPaid && stageId && (
                <SectionShell icon={ImageIcon} title="CRIATIVOS" subtitle="Desempenho dos anúncios · Meta Ads">
                  <StageCreativePerformanceTable projectId={projectId} funnelId={funnel.id} stageId={stageId} days={days} stageType={stageType} />
                </SectionShell>
              )}

              {stageId && stageType && (
                <TesteLpSection projectId={projectId} funnelId={funnel.id} stageId={stageId} days={days} stageType={stageType} />
              )}

              <SectionShell icon={Sparkles} title="TOP CRIATIVOS" subtitle="Ranking dos melhores anúncios do período">
                <TopCreativesGallery
                  projectId={projectId}
                  days={days}
                  campaignIds={campaignIds}
                  funnelId={funnel.id}
                  stageId={stageId}
                  funnelContext={{ days, funnelType: "launch", funnelName: funnel?.name }}
                  surveyDataByAdId={survey.byAdId}
                  surveyDataByAdIdDynamic={survey.byAdIdDynamic}
                  surveyQuestions={survey.questions}
                />
              </SectionShell>

              {/* ---- Leva 3: Segmentação (Hot/Cold + Funil) + Pesquisa ---- */}
              <div className="space-y-4">
                <GroupHeading icon={PieChartIcon} title="SEGMENTAÇÃO & FUNIL" subtitle="Distribuição de investimento, leads/compradores e conversão" />
                {/* 3 donuts lado a lado (mesma altura) */}
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <TesteDonut title="Investimento — Hot/Cold" hot={spendHotCold.hot} cold={spendHotCold.cold} outros={spendHotCold.outros} fmt={money0} />
                  {metrics.hotColdLeads ? (
                    <TesteDonut title="Leads — Hot/Cold" hot={metrics.hotColdLeads.hot} cold={metrics.hotColdLeads.cold} outros={metrics.hotColdLeads.outros} fmt={int} />
                  ) : (
                    <TestePanelMsg title="Leads — Hot/Cold" msg="Mapeie a coluna utm_term na planilha de leads." />
                  )}
                  {isPaid && (() => {
                    const stageBuyers = stageHotColdBuyers?.hasMapping
                      ? { hot: stageHotColdBuyers.hot, cold: stageHotColdBuyers.cold, outros: stageHotColdBuyers.outros }
                      : null;
                    const buyers = stageBuyers ?? metrics.hotColdBuyers;
                    return buyers ? (
                      <TesteDonut title="Compradores — Hot/Cold" hot={buyers.hot} cold={buyers.cold} outros={buyers.outros} fmt={int} />
                    ) : (
                      <TestePanelMsg title="Compradores — Hot/Cold" msg="Mapeie a coluna utm_term na planilha de vendas." />
                    );
                  })()}
                </div>

                {/* Funil em largura total */}
                <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                  <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>Funil de conversão</p>
                  <div className="mx-auto max-w-2xl">
                    <TesteFunnel
                      impressions={overview?.totalImpressions ?? 0}
                      linkClicks={overview?.totalLinkClicks ?? null}
                      landingPageViews={overview?.totalLandingPageViews ?? null}
                      leads={metrics.totalLeads}
                      checkoutVisits={isPaid ? metrics.checkoutVisits : null}
                      sales={isPaid ? metrics.totalVendas : null}
                      leadsLabel={isPaid ? "Leads Popup" : undefined}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <GroupHeading icon={ClipboardList} title="QUALIFICAÇÃO DA PESQUISA" subtitle="Perfil do público que respondeu" />
                <SurveyQualificationSection
                  isLoading={survey.isLoading}
                  hasSurveys={survey.totalResponses > 0 || !!survey.fallbackReason}
                  data={{
                    byQuestion: survey.byQuestion,
                    byQuestionByOrigin: survey.byQuestionByOrigin,
                    questions: survey.questions,
                    totalResponses: survey.totalResponses,
                    usingFallback: survey.usingFallback,
                    fallbackReason: survey.fallbackReason,
                    matchedResponses: survey.matchedResponses,
                    unmatchedResponses: survey.unmatchedResponses,
                  }}
                />
              </div>

              {/* ---- Leva 4: CTR×CPM + Comparação + Vendas + Grupos ---- */}
              <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(253,212,73,.12)", border: "1px solid rgba(253,212,73,.25)", color: T.gold }}>
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: "2px", lineHeight: 1, color: T.text }}>CTR × CPM — SATURAÇÃO</h3>
                      <p className="text-[10px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>Quando CTR cai e CPM sobe, os anúncios estão saturando</p>
                    </div>
                  </div>
                  <SaturationBadge dailyData={dailyData ?? null} />
                </div>
                {dailyLoading ? (
                  <Skeleton className="h-56" style={{ background: T.surface2 }} />
                ) : dailyData && dailyData.length > 0 ? (
                  <CtrCpmChart data={dailyData} comparisonDays={compDays ?? undefined} compFunnelName={compData?.compareFunnelName} />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                )}
              </div>

              {hasComparison && compDays && dailyData && dailyData.length > 0 && (
                <div className="space-y-4">
                  <GroupHeading icon={ArrowLeftRight} title="COMPARAÇÃO DE LANÇAMENTOS" subtitle={`Este funil × ${compData?.compareFunnelName ?? "comparação"} — alinhado por dia`} />
                  <FunnelComparisonChart data={dailyData} comparisonDays={compDays} compFunnelName={compData?.compareFunnelName} atualSalesByDay={compData?.atualSalesByDay} />
                </div>
              )}

              {isPaid && stageId && (
                <div className="space-y-5">
                  <GroupHeading icon={Banknote} title="VENDAS" subtitle="Captação e produto principal" />
                  <StageSalesSection projectId={projectId} funnelId={funnel.id} stageId={stageId} subtype="capture" title="Vendas de Captação" days={days} stageType={stageType} adsetsMap={adsetsMap} showCreativeTable={false} />
                  <div className="border-t border-border/20" />
                  <StageSalesSection projectId={projectId} funnelId={funnel.id} stageId={stageId} subtype="main_product" title="Produto Principal" days={days} adsetsMap={adsetsMap} />
                </div>
              )}

              <div className="space-y-4">
                <GroupHeading icon={Users} title="GRUPOS" subtitle="Tracking de participantes" />
                <GroupsDashboardSection projectId={projectId} funnelId={funnel.id} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Moldura de seção estilizada (header Bebas Neue + faixa gradiente ouro).
// Envolve os componentes REAIS do dashboard pra manter dados/features 1:1
// dando a eles a identidade visual do TESTE.
// ============================================================
function SectionShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border p-[17px] space-y-4" style={{ background: T.surface, borderColor: T.border }}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(253,212,73,.12)", border: "1px solid rgba(253,212,73,.25)", color: T.gold }}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: "2px", lineHeight: 1, color: T.text }}>{title}</h3>
          {subtitle && <p className="text-[10px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{subtitle}</p>}
        </div>
      </div>
      <div className="h-px w-full" style={{ background: "linear-gradient(90deg, rgba(253,212,73,.35), transparent)" }} />
      {children}
    </div>
  );
}

// Cabeçalho de grupo estilizado (sem container) — pra grupos de cards que já têm
// seu próprio card (donuts, funil), evitando aninhar bordas.
function GroupHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(253,212,73,.12)", border: "1px solid rgba(253,212,73,.25)", color: T.gold }}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: "2px", lineHeight: 1, color: T.text }}>{title}</h3>
          {subtitle && <p className="text-[10px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{subtitle}</p>}
        </div>
      </div>
      <div className="h-px w-full" style={{ background: "linear-gradient(90deg, rgba(253,212,73,.35), transparent)" }} />
    </div>
  );
}

// Donut Hot/Cold/Outros no estilo TESTE (recharts + cores Loyola).
const DONUT_COLORS: Record<"hot" | "cold" | "outros", string> = { hot: "#fb923c", cold: "#38bdf8", outros: "#7b8494" };
function TesteDonut({ title, hot, cold, outros, fmt }: { title: string; hot: number; cold: number; outros: number; fmt: (v: number) => string }) {
  const rows = [
    { key: "hot" as const, name: "Hot", value: hot },
    { key: "cold" as const, name: "Cold", value: cold },
    { key: "outros" as const, name: "Outros", value: outros },
  ];
  const total = hot + cold + outros;
  const chartData = rows.filter((d) => d.value > 0);
  return (
    <div className="rounded-[12px] border p-[17px] space-y-3" style={{ background: T.surface, borderColor: T.border }}>
      <p className="mat-ct flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{title}</p>
      {total <= 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: T.muted }}>Sem dados no período.</p>
      ) : (
        <>
          <div className="mx-auto aspect-square w-full max-w-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="90%" strokeWidth={0} paddingAngle={2}>
                  {chartData.map((d) => <Cell key={d.key} fill={DONUT_COLORS[d.key]} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [fmt(Number(v)), n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 text-[11px]" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
            {rows.map((d) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={d.key} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[d.key] }} />
                  <span className="w-14 shrink-0" style={{ color: T.text }}>{d.name}</span>
                  <span className="flex-1 tabular-nums" style={{ color: T.muted2 }}>{d.value > 0 ? fmt(d.value) : "—"}</span>
                  <span className="w-12 shrink-0 text-right tabular-nums" style={{ color: T.muted2 }}>{pct > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TestePanelMsg({ title, msg }: { title: string; msg: string }) {
  return (
    <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
      <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{title}</p>
      <p className="py-8 text-center text-sm" style={{ color: T.muted }}>{msg}</p>
    </div>
  );
}

// Funil de conversão trapezoidal no estilo TESTE (SVG, cores Loyola).
const FUNNEL_COLORS = ["#fdd449", "#f59e0b", "#fb923c", "#10b981", "#0d9488", "#ef4444"];
function TesteFunnel({
  impressions,
  linkClicks,
  landingPageViews,
  leads,
  checkoutVisits,
  sales,
  leadsLabel,
}: {
  impressions: number;
  linkClicks: number | null;
  landingPageViews: number | null;
  leads: number | null;
  checkoutVisits?: number | null;
  sales?: number | null;
  leadsLabel?: string;
}) {
  const fmtN = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toLocaleString("pt-BR"));
  const conv = (from: number, to: number) => (from === 0 ? "0%" : `${((to / from) * 100).toFixed(1)}%`);
  const stages: { label: string; value: number }[] = [{ label: "Impressões", value: impressions }];
  if (linkClicks != null && linkClicks > 0) stages.push({ label: "Cliques no Link", value: linkClicks });
  if (landingPageViews != null && landingPageViews > 0) stages.push({ label: "Visualização da LP", value: landingPageViews });
  if (leads != null && leads > 0) stages.push({ label: leadsLabel || "Leads", value: leads });
  if (checkoutVisits != null && checkoutVisits > 0) stages.push({ label: "Visitas Checkout", value: checkoutVisits });
  if (sales != null && sales > 0) stages.push({ label: "Vendas", value: sales });
  if (stages.length === 0 || impressions === 0) {
    return <p className="py-8 text-center text-sm" style={{ color: T.muted }}>Sem dados suficientes pra o funil.</p>;
  }
  const STAGE_H = 55, GAP = 22, TOTAL_W = 520, MIN_W = 160, MX = 10;
  const SVG_W = TOTAL_W + MX * 2;
  const maxV = stages[0].value;
  const cx = MX + TOTAL_W / 2;
  const svgH = stages.length * STAGE_H + Math.max(0, stages.length - 1) * GAP + 10;
  const wFor = (v: number) => Math.max((v / maxV) * TOTAL_W, MIN_W);
  return (
    <svg viewBox={`0 0 ${SVG_W} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Funil de conversão" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
      {stages.map((s, i) => {
        const topW = wFor(s.value);
        const botW = i + 1 < stages.length ? wFor(stages[i + 1].value) : topW * 0.5;
        const y = 5 + i * (STAGE_H + GAP);
        const yB = y + STAGE_H;
        const pts = [`${cx - topW / 2},${y}`, `${cx + topW / 2},${y}`, `${cx + botW / 2},${yB}`, `${cx - botW / 2},${yB}`].join(" ");
        const prev = i > 0 ? stages[i - 1] : null;
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
        return (
          <g key={s.label}>
            {prev && <text x={cx} y={y - GAP / 2 - 2} textAnchor="middle" dominantBaseline="central" fontSize={9} fill={T.muted}>↓ {conv(prev.value, s.value)} de conversão</text>}
            <polygon points={pts} fill={color} fillOpacity={0.88} stroke={color} strokeWidth={1} />
            <text x={cx} y={y + 18} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fill="#0b0b12">{s.label}</text>
            <text x={cx} y={y + STAGE_H - 22} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill="#0b0b12">{fmtN(s.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Testes de LPs — replica a seção do LaunchDashboard (mesmos hooks/tabela) com header estilizado.
function TesteLpSection({
  projectId,
  funnelId,
  stageId,
  days,
  stageType,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  days: number;
  stageType: StageType;
}) {
  const [publicoFilter, setPublicoFilter] = useState<"todos" | "hot" | "cold">("todos");
  const { lps, isLoading } = useLpPerformanceData({ projectId, funnelId, stageId, days, publicoFilter });
  const { data: stage } = useFunnelStage(projectId, funnelId, stageId);
  const updateStage = useUpdateStage(projectId, funnelId, stageId);
  const lpLinks = stage?.lpLinks ?? {};
  const handleSaveLpLink = useCallback(
    async (lpName: string, url: string) => {
      const next = { ...lpLinks, [lpName.trim().toLowerCase()]: url.trim() };
      await updateStage.mutateAsync({ lpLinks: next });
    },
    [lpLinks, updateStage],
  );
  const isPaid = stageType === "paid";

  return (
    <SectionShell icon={LayoutTemplate} title="TESTES DE LPs" subtitle="Desempenho das landing pages">
      <div className="-mt-1 flex justify-end">
        <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
          {(["todos", "hot", "cold"] as const).map((opt) => (
            <button key={opt} type="button" onClick={() => setPublicoFilter(opt)}
              className={`h-6 rounded px-2.5 text-[11px] font-medium transition-colors ${publicoFilter === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
              {opt === "todos" ? "Todos" : opt === "hot" ? "🔥 Hot" : "❄️ Cold"}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="p-4 text-center text-sm text-muted-foreground">Carregando dados de LPs...</div>
      ) : (
        <LpPerformanceTable rows={lps} stageType={isPaid ? "paid" : "free"} isLoading={false} lpLinks={lpLinks} onSaveLpLink={handleSaveLpLink} />
      )}
    </SectionShell>
  );
}

// Estilo de input dark reusado nos gráficos de projeção.
const inputCls = "rounded border bg-transparent px-2 py-1 text-[11px]";
const inputStyle = { borderColor: T.border, color: T.text, colorScheme: "dark" as const };

// Leads: Tendência + Meta — reusa expandChartDataV2 (números idênticos), estilo TESTE.
function TesteTrendChart({ rows, funnel, projectId, isPaid }: { rows: DailyRow[]; funnel: Funnel; projectId: string; isPaid: boolean }) {
  const update = useUpdateFunnel(projectId, funnel.id);
  const lastDate = rows.length ? rows[rows.length - 1].date : new Date().toISOString().slice(0, 10);
  const [dataFinal, setDataFinal] = useState<string>(funnel.leadsGoalDataFinal || addDaysISO(lastDate, 30));
  const [metaTotal, setMetaTotal] = useState<number>(funnel.leadsGoalMeta ?? 0);
  const data = useMemo(
    () => expandChartDataV2(rows, dataFinal, metaTotal, 5).map((d) => ({ ...d, label: dmLabel(d.date) })),
    [rows, dataFinal, metaTotal],
  );
  const pct = useMemo(() => calculateProjectionPercentage(data), [data]);
  const todayLabel = data.find((d) => d.isProjection)?.label ?? null;
  const noun = isPaid ? "Ingressos" : "Leads";
  const onData = (v: string) => { setDataFinal(v); if (v) update.mutate({ leadsGoalDataFinal: v }); };
  const onMeta = (v: number) => { setMetaTotal(v); update.mutate({ leadsGoalMeta: v }); };

  return (
    <div className="rounded-[12px] border p-[17px] space-y-3" style={{ background: T.surface, borderColor: T.border }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mat-ct flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{noun}: tendência + meta — real (esmeralda) · projeção (ouro tracejado) · meta (vermelho)</p>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: pct >= 100 ? "rgba(16,185,129,.15)" : "rgba(245,158,11,.15)", color: pct >= 100 ? T.emerald : T.amber, fontFamily: "'JetBrains Mono',monospace" }}>{pct.toFixed(0)}% da meta</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>Data final
          <input type="date" value={dataFinal} onChange={(e) => onData(e.target.value)} className={inputCls} style={inputStyle} />
        </label>
        <label className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>Meta total
          <input type="number" value={metaTotal || ""} onChange={(e) => onMeta(Number(e.target.value) || 0)} className={`w-24 ${inputCls}`} style={inputStyle} />
        </label>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={T.grid} vertical={false} />
          <XAxis dataKey="label" tick={MONO_TICK} stroke="transparent" />
          <YAxis tick={MONO_TICK} stroke="transparent" width={40} />
          <Tooltip content={<TrendTip />} />
          <Bar dataKey="dailyReal" name="Real/dia" fill="rgba(255,255,255,.13)" radius={[2, 2, 0, 0]}><LabelList content={ptLabelFn(int)} /></Bar>
          <Bar dataKey="dailyProjected" name="Projeção/dia" fill="rgba(245,158,11,.32)" radius={[2, 2, 0, 0]}><LabelList content={ptLabelFn(int)} /></Bar>
          <Line dataKey="cumulativeReal" name="Acum. real" type="monotone" stroke={T.emerald} strokeWidth={2} dot={{ r: 2.5, fill: T.emerald, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(int)} /></Line>
          <Line dataKey="cumulativeProjected" name="Acum. projeção" type="monotone" stroke={T.gold} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5, fill: T.gold, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(int)} /></Line>
          <Line dataKey="meta" name="Meta" type="monotone" stroke={T.red} strokeWidth={1.5} dot={false} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke={T.muted2} strokeDasharray="2 2" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Leads: Projeção por Custo — reusa o hook useLeadsProjection (números idênticos), estilo TESTE.
function TesteCostChart({ rows, funnel, projectId, isPaid }: { rows: DailyRow[]; funnel: Funnel; projectId: string; isPaid: boolean }) {
  const update = useUpdateFunnel(projectId, funnel.id);
  const proj = useLeadsProjection(rows, funnel.leadsGoalDataFinal ?? undefined, funnel.leadsGoalMeta ?? undefined, funnel.leadsGoalGastoTotal ?? undefined);
  // pré-preenche o gasto com a sugestão pra a projeção já aparecer.
  useEffect(() => {
    if (proj.gastoTotalProjetado === 0 && proj.gastoTotalSuggestion > 0) proj.setGastoTotalProjetado(proj.gastoTotalSuggestion);
  }, [proj.gastoTotalSuggestion, proj.gastoTotalProjetado, proj]);
  const data = useMemo(() => proj.chartData.map((d) => ({ ...d, label: dmLabel(d.date) })), [proj.chartData]);
  const todayLabel = data.find((d) => d.isProjection)?.label ?? null;
  const noun = isPaid ? "Ingressos" : "Leads";
  const onData = (v: string) => { proj.setDataFinal(v); if (v) update.mutate({ leadsGoalDataFinal: v }); };
  const onMeta = (v: number) => { proj.setMetaTotal(v); update.mutate({ leadsGoalMeta: v }); };

  return (
    <div className="rounded-[12px] border p-[17px] space-y-3" style={{ background: T.surface, borderColor: T.border }}>
      <p className="mat-ct flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{noun}: projeção por custo — real (esmeralda) · projeção (ouro tracejado) · meta (vermelho) · CPL projetado (âmbar, dir.)</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>Data final
          <input type="date" value={proj.dataFinal} onChange={(e) => onData(e.target.value)} className={inputCls} style={inputStyle} />
        </label>
        <label className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>Meta
          <input type="number" value={proj.metaTotal || ""} onChange={(e) => onMeta(Number(e.target.value) || 0)} className={`w-20 ${inputCls}`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>Gasto projetado (R$)
          <input type="number" value={proj.gastoTotalProjetado || ""} placeholder={proj.gastoTotalSuggestion ? String(Math.round(proj.gastoTotalSuggestion)) : ""} onChange={(e) => proj.setGastoTotalProjetado(Number(e.target.value) || 0)} className={`w-28 ${inputCls}`} style={inputStyle} />
        </label>
      </div>
      {proj.error ? (
        <p className="py-8 text-center text-sm" style={{ color: T.muted }}>{proj.error}</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={T.grid} vertical={false} />
            <XAxis dataKey="label" tick={MONO_TICK} stroke="transparent" />
            <YAxis yAxisId="leads" tick={MONO_TICK} stroke="transparent" width={40} />
            <YAxis yAxisId="cpl" orientation="right" tick={MONO_TICK} stroke="transparent" width={44} tickFormatter={(v) => `R$${Math.round(v)}`} />
            <Tooltip content={<CostTip />} />
            <Line yAxisId="leads" dataKey="cumulativeReal" name="Acum. real" type="monotone" stroke={T.emerald} strokeWidth={2} dot={{ r: 2.5, fill: T.emerald, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(int)} /></Line>
            <Line yAxisId="leads" dataKey="cumulativeProjected" name="Acum. projeção" type="monotone" stroke={T.gold} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5, fill: T.gold, strokeWidth: 0 }} connectNulls><LabelList content={ptLabelFn(int)} /></Line>
            <Line yAxisId="leads" dataKey="metaCumulative" name="Meta" type="monotone" stroke={T.red} strokeWidth={1.5} dot={false} />
            <Line yAxisId="cpl" dataKey="cplProjected" name="CPL proj." type="monotone" stroke={T.amber} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
            {todayLabel && <ReferenceLine yAxisId="leads" x={todayLabel} stroke={T.muted2} strokeDasharray="2 2" />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
