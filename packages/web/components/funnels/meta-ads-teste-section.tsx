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

import { useCallback, useMemo, useState, type ReactNode, type ComponentType } from "react";
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
} from "recharts";
import { FlaskConical, ImageIcon, Sparkles, LayoutTemplate, PieChart as PieChartIcon, ClipboardList } from "lucide-react";
import { useTrafficOverview, useTrafficCampaigns } from "@/lib/hooks/use-traffic-analytics";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { useStageSalesByDay } from "@/lib/hooks/use-stage-sales-by-day";
import { useStageHotColdBuyers } from "@/lib/hooks/use-stage-hot-cold-buyers";
import { useSurveyAggregation } from "@/lib/hooks/use-survey-aggregation";
import { useLpPerformanceData } from "@/lib/hooks/useLpPerformanceData";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { overrideCplWithUniqueIngressos, type DailyRow } from "@/lib/utils/funnel-metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { StageCreativePerformanceTable } from "./stage-creative-performance-table";
import { TopCreativesGallery } from "./top-creatives-gallery";
import { ConversionFunnel } from "./conversion-funnel";
import { HotColdSpendDonut } from "./hot-cold-spend-donut";
import { HotColdCountDonut } from "./hot-cold-count-donut";
import { SurveyQualificationSection } from "./survey-qualification-section";
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

interface Kpi {
  l: string;
  v: string;
  s?: string;
  g: string;
  fill: number;
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
      spend: r.spend,
      meta: avgLeads,
    }));
    return { leadsOf, avgLeads, avgCpl, daysAboveAvg, maxSpend, maxLeads, chart };
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

  const kpis: Kpi[] = [];
  kpis.push({ l: "Investimento", v: brl(metrics.spend), s: `${rows.length} dias`, g: G.goldAmber, fill: 100 });
  if (showFaturamento) {
    kpis.push({ l: "Faturamento Total", v: brl(faturamentoTotalCard), s: `único ${brl(faturamentoUnicoCard)}`, g: G.emeraldTeal, fill: 100 });
  }
  kpis.push({
    l: isPaid ? "Leads Popup" : "Leads Únicos",
    v: metrics.hasLinkedSheet ? int(metrics.totalLeads) : "—",
    s: metrics.hasLinkedSheet ? `pg ${int(metrics.leadsPagos)} · org ${int(metrics.leadsOrg)} · s/t ${int(metrics.leadsSemTrack)}` : "vincule planilha",
    g: G.goldOrange,
    fill: 100,
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
  });
  kpis.push({ l: "Connect Rate", v: pct(metrics.connectRate), s: "LP views ÷ cliques", g: G.goldAmber, fill: Math.min(100, metrics.connectRate ?? 0) });
  kpis.push({ l: "CTR (link)", v: pct(metrics.ctr), s: overview ? `${int(overview.totalLinkClicks)} cliques` : undefined, g: G.goldOrange, fill: Math.min(100, (metrics.ctr ?? 0) * 25) });
  kpis.push({ l: "CPC (link)", v: brl(metrics.cpc), s: "spend ÷ cliques", g: G.amberOrange, fill: 55 });
  kpis.push({ l: "CPM", v: brl(metrics.cpm), s: overview ? `${int(overview.totalImpressions)} impr.` : undefined, g: G.amberRed, fill: 45 });
  if (isPaid && metrics.checkoutConversionRate !== null) {
    kpis.push({ l: "Taxa Checkout", v: pct(metrics.checkoutConversionRate), s: metrics.vendasPago != null && metrics.checkoutVisits ? `${int(metrics.vendasPago)} ÷ ${int(metrics.checkoutVisits)}` : undefined, g: G.emeraldTeal, fill: Math.min(100, metrics.checkoutConversionRate) });
  }
  if (surveyResponseRate !== null && survey) {
    kpis.push({ l: "Pesquisa", v: `${surveyResponseRate.toFixed(1)}%`, s: `${int(survey.matchedResponses)} match · ${int(survey.unmatchedResponses)} s/ match`, g: G.goldAmber, fill: Math.min(100, surveyResponseRate) });
  }

  const consistencyPct = rows.length > 0 ? Math.round((derived.daysAboveAvg / rows.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* seletor de período — funciona (refetch por days) */}
      <div className="flex justify-end">
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
                  <div key={k.l} className="mat-kpi">
                    <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-[12px]" style={{ background: k.g }} />
                    <div className="mat-kpi-glow" style={{ background: k.g }} />
                    <p className="text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{k.l}</p>
                    <p className="mt-1 font-extrabold" style={{ fontSize: "clamp(17px,2.1vw,26px)" }}>{k.v}</p>
                    {k.s && <p className="mt-0.5 text-[10px]" style={{ color: T.muted2 }}>{k.s}</p>}
                    <div className="mt-2 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
                      <div className="mat-bf" style={{ background: k.g, width: `${Math.max(4, Math.min(100, k.fill))}%` }} />
                    </div>
                  </div>
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
                        <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(value, name) => [int(Number(value)), name === "meta" ? "Média" : isPaid ? "Ingressos" : "Leads"]} />
                        <Bar dataKey="meta" fill="rgba(253,212,73,.13)" stroke="rgba(253,212,73,.4)" strokeWidth={1} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="leads" radius={[3, 3, 0, 0]}>
                          {derived.chart.map((r) => <Cell key={r.date} fill={r.leads >= derived.avgLeads ? "rgba(16,185,129,.55)" : "rgba(239,68,68,.5)"} />)}
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
                        <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(value) => [brl(Number(value)), "CPL"]} />
                        <Area dataKey="cpl" stroke="none" fill="rgba(245,158,11,.08)" connectNulls />
                        <Line dataKey="cpl" type="monotone" stroke={T.amber} strokeWidth={2} connectNulls
                          dot={(p: { cx?: number; cy?: number; payload?: { cpl?: number | null }; index?: number }) => {
                            const above = derived.avgCpl != null && p.payload?.cpl != null && p.payload.cpl > derived.avgCpl;
                            return <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={above ? T.red : T.amber} stroke="none" />;
                          }}
                        />
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
                      <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(value) => [brl(Number(value)), "Investimento"]} />
                      <Area dataKey="spend" type="monotone" stroke={T.gold} strokeWidth={2} fill="url(#mat-spend)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabela diária */}
              {rows.length > 0 && (
                <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: T.border }}>
                  <table className="w-full text-right" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: T.surface2 }}>
                        {["Dia", "Invest", isPaid ? "Ingr" : "Leads", "CPL", "CTR", "CPC", "CPM", "LP View", "Connect"].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[8px] uppercase ${i === 0 ? "text-left" : ""}`} style={{ color: T.muted, letterSpacing: "1px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...rows].reverse().map((r) => {
                        const isToday = r.date === today;
                        const leads = derived.leadsOf(r);
                        const good = leads >= derived.avgLeads;
                        return (
                          <tr key={r.date} style={{ background: isToday ? "rgba(253,212,73,.06)" : good ? "rgba(16,185,129,.02)" : "rgba(239,68,68,.024)", outline: isToday ? `1px solid ${T.gold}66` : undefined, outlineOffset: -1, borderTop: `1px solid ${T.border}` }}>
                            <td className="px-3 py-1.5 text-left" style={{ color: isToday ? T.gold : T.muted2 }}>{r.date.slice(8, 10)}/{r.date.slice(5, 7)}{isToday ? " · hoje" : ""}</td>
                            <td className="px-3 py-1.5">{brl(r.spend)}</td>
                            <td className="px-3 py-1.5" style={{ color: good ? T.emerald : T.red }}>{int(leads)}</td>
                            <td className="px-3 py-1.5" style={{ color: derived.avgCpl != null && r.cplG != null && r.cplG > derived.avgCpl ? T.red : T.text }}>{brl(r.cplG)}</td>
                            <td className="px-3 py-1.5">{pct(r.ctr)}</td>
                            <td className="px-3 py-1.5">{brl(r.cpc)}</td>
                            <td className="px-3 py-1.5">{brl(r.cpm)}</td>
                            <td className="px-3 py-1.5">{int(r.lpView)}</td>
                            <td className="px-3 py-1.5">{pct(r.connectRate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {funnelCampaigns.length > 0 ? (
                    <HotColdSpendDonut campaigns={funnelCampaigns} />
                  ) : (
                    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                      <h3 className="mb-4 text-sm font-semibold">Distribuição de Investimento</h3>
                      <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                    <h3 className="mb-4 text-sm font-semibold">Funil de Conversão</h3>
                    <ConversionFunnel
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

                {(metrics.hotColdLeads || metrics.hotColdBuyers) && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {metrics.hotColdLeads ? (
                      <HotColdCountDonut aggregate={metrics.hotColdLeads} title="Distribuição de Leads (Hot/Cold)" noun={{ singular: "lead", plural: "leads" }} />
                    ) : (
                      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                        <h3 className="mb-4 text-sm font-semibold">Distribuição de Leads (Hot/Cold)</h3>
                        <p className="py-8 text-center text-sm text-muted-foreground">Mapeie a coluna <span className="font-mono">utm_term</span> na planilha de leads.</p>
                      </div>
                    )}
                    {isPaid && (() => {
                      const stageBuyers = stageHotColdBuyers?.hasMapping
                        ? { hot: stageHotColdBuyers.hot, cold: stageHotColdBuyers.cold, outros: stageHotColdBuyers.outros, total: stageHotColdBuyers.total, items: stageHotColdBuyers.items }
                        : null;
                      const buyers = stageBuyers ?? metrics.hotColdBuyers;
                      return buyers ? (
                        <HotColdCountDonut aggregate={buyers} title="Distribuição de Compradores (Hot/Cold)" noun={{ singular: "comprador", plural: "compradores" }} />
                      ) : (
                        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                          <h3 className="mb-4 text-sm font-semibold">Distribuição de Compradores (Hot/Cold)</h3>
                          <p className="py-8 text-center text-sm text-muted-foreground">Mapeie a coluna <span className="font-mono">utm_term</span> na planilha de vendas.</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
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
