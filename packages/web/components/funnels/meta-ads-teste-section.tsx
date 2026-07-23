"use client";

/**
 * META ADS — TESTE (aba da Captação Paga).
 *
 * Estrutura visual do dash de referência (maycofix) — cards com barra-gradiente
 * no topo + glow neon, barra de progresso com shimmer, gráficos com cor
 * CONDICIONAL, tabela mono com linha "hoje" — mas RECOLORIDO pra paleta Loyola
 * (ouro #fdd449 / esmeralda / âmbar / vermelho) e com a logo de fundo em marca
 * d'água. Consome o dailyData da Meta (mesmo hook do dash, spend com imposto,
 * CTR/CPC de link). Gráficos em recharts (lib do projeto).
 */

import { useMemo, useState } from "react";
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
import { FlaskConical } from "lucide-react";
import { useCampaignDailyInsightsBulk, type CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import { Skeleton } from "@/components/ui/skeleton";

// ---- tokens Loyola (mesma ESTRUTURA do design de ref, cores nossas) ----
const T = {
  bg: "#0b0b12", // dark neutro (não o roxo-azul do ref)
  surface: "#15151d",
  surface2: "#1c1c27",
  border: "rgba(255,255,255,.07)",
  gold: "#fdd449", // marca Loyola (o "X" amarelo)
  gold2: "#fbbf24",
  amber: "#f59e0b",
  emerald: "#10b981", // positivo / bate a média
  red: "#ef4444", // negativo / abaixo
  text: "#eef2f7",
  muted: "#7b8494",
  muted2: "#a9b2c0",
  grid: "rgba(255,255,255,.04)",
};
const GRAD = `linear-gradient(135deg, ${T.gold} 0%, ${T.amber} 45%, ${T.emerald} 100%)`;

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return isNaN(n) ? 0 : n;
}
function action(d: CampaignDailyInsight, type: string): number {
  const a = d.actions?.find((x) => x.action_type === type);
  return a ? num(a.value) : 0;
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

interface DayRow {
  date: string;
  label: string;
  spend: number;
  leads: number;
  linkClicks: number;
  lpViews: number;
  impressions: number;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  connect: number | null;
}

function MetaAdsTesteSection({ data }: { data: CampaignDailyInsight[] }) {
  const { rows, totals, avgLeads, avgCpl, daysAboveAvg } = useMemo(() => {
    const byDate = new Map<string, { spend: number; leads: number; linkClicks: number; lpViews: number; impressions: number }>();
    for (const d of data) {
      const key = d.date_start;
      const e = byDate.get(key) ?? { spend: 0, leads: 0, linkClicks: 0, lpViews: 0, impressions: 0 };
      e.spend += applyMetaAdsTax(num(d.spend), key);
      e.leads += action(d, "lead");
      e.linkClicks += action(d, "link_click");
      e.lpViews += action(d, "landing_page_view");
      e.impressions += num(d.impressions);
      byDate.set(key, e);
    }
    const rows: DayRow[] = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, e]) => ({
        date,
        label: date.slice(8, 10) + "/" + date.slice(5, 7),
        ...e,
        cpl: e.leads > 0 ? e.spend / e.leads : null,
        ctr: e.impressions > 0 ? (e.linkClicks / e.impressions) * 100 : null,
        cpc: e.linkClicks > 0 ? e.spend / e.linkClicks : null,
        cpm: e.impressions > 0 ? (e.spend / e.impressions) * 1000 : null,
        connect: e.linkClicks > 0 ? (e.lpViews / e.linkClicks) * 100 : null,
      }));
    const t = rows.reduce(
      (s, r) => ({
        spend: s.spend + r.spend,
        leads: s.leads + r.leads,
        linkClicks: s.linkClicks + r.linkClicks,
        lpViews: s.lpViews + r.lpViews,
        impressions: s.impressions + r.impressions,
      }),
      { spend: 0, leads: 0, linkClicks: 0, lpViews: 0, impressions: 0 },
    );
    const daysWithLeads = rows.filter((r) => r.leads > 0).length || 1;
    const avgLeads = t.leads / Math.max(1, daysWithLeads);
    const cplsValid = rows.filter((r) => r.cpl != null) as (DayRow & { cpl: number })[];
    const avgCpl = cplsValid.length > 0 ? cplsValid.reduce((s, r) => s + r.cpl, 0) / cplsValid.length : null;
    const daysAboveAvg = rows.filter((r) => r.leads >= avgLeads).length;
    return { rows, totals: t, avgLeads, avgCpl, daysAboveAvg };
  }, [data]);

  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-border/40 p-12 text-center text-sm text-muted-foreground">Sem dados Meta no período.</div>;
  }

  const totalCpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const totalCtr = totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : null;
  const totalCpc = totals.linkClicks > 0 ? totals.spend / totals.linkClicks : null;
  const totalCpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null;
  const totalConnect = totals.linkClicks > 0 ? (totals.lpViews / totals.linkClicks) * 100 : null;
  const consistencyPct = Math.round((daysAboveAvg / rows.length) * 100);
  const today = new Date().toISOString().slice(0, 10);

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const maxLeads = Math.max(...rows.map((r) => r.leads), 1);
  const last = rows[rows.length - 1];
  const G = {
    goldAmber: `linear-gradient(135deg,${T.gold},${T.amber})`,
    emeraldGold: `linear-gradient(135deg,${T.emerald},${T.gold})`,
    amberRed: `linear-gradient(135deg,${T.amber},${T.red})`,
    goldEmerald: `linear-gradient(135deg,${T.gold},${T.emerald})`,
    amberGold: `linear-gradient(135deg,${T.amber},${T.gold2})`,
    goldRed: `linear-gradient(135deg,${T.gold2},${T.red})`,
  };
  const kpis: { l: string; v: string; s: string; g: string; fill: number }[] = [
    { l: "Investimento", v: brl(totals.spend), s: `último dia ${brl(last.spend)}`, g: G.goldAmber, fill: (last.spend / maxSpend) * 100 },
    { l: "Leads", v: int(totals.leads), s: `média ${avgLeads.toFixed(1)}/dia`, g: G.emeraldGold, fill: (last.leads / maxLeads) * 100 },
    { l: "CPL", v: totalCpl != null ? brl(totalCpl) : "—", s: avgCpl != null ? `média diária ${brl(avgCpl)}` : "sem leads", g: G.amberRed, fill: totalCpl != null && avgCpl != null ? Math.min(100, (avgCpl / totalCpl) * 60) : 0 },
    { l: "CTR (link)", v: pct(totalCtr), s: `${int(totals.linkClicks)} cliques no link`, g: G.goldEmerald, fill: Math.min(100, (totalCtr ?? 0) * 25) },
    { l: "CPC (link)", v: totalCpc != null ? brl(totalCpc) : "—", s: "spend ÷ cliques no link", g: G.amberGold, fill: 55 },
    { l: "CPM", v: totalCpm != null ? brl(totalCpm) : "—", s: `${int(totals.impressions)} impressões`, g: G.goldRed, fill: 45 },
    { l: "LP Views", v: int(totals.lpViews), s: "landing_page_view", g: G.goldEmerald, fill: totals.linkClicks > 0 ? Math.min(100, (totals.lpViews / totals.linkClicks) * 100) : 0 },
    { l: "Connect (LP)", v: pct(totalConnect), s: "LP views ÷ cliques link", g: G.emeraldGold, fill: Math.min(100, totalConnect ?? 0) },
  ];

  const chartData = rows.map((r) => ({ ...r, meta: avgLeads }));

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300..800&family=JetBrains+Mono:wght@300..500&display=swap" />
      <style>{`
        @keyframes mat-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.8)} }
        @keyframes mat-sh { 0%{opacity:0;transform:translateX(-100%)} 50%{opacity:1} 100%{opacity:0;transform:translateX(100%)} }
        .mat-kpi { position:relative; overflow:hidden; background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:17px 15px; transition:border-color .2s, transform .2s; }
        .mat-kpi:hover { border-color:rgba(255,255,255,.13); transform:translateY(-2px); }
        .mat-kpi-glow { position:absolute; top:-24px; right:-18px; width:90px; height:90px; border-radius:50%; filter:blur(22px); opacity:.10; pointer-events:none; }
        .mat-bf { height:3px; border-radius:99px; transition:width 1.4s cubic-bezier(.4,0,.2,1); }
        .mat-bar-fill { position:relative; overflow:hidden; height:10px; border-radius:99px; background:linear-gradient(90deg,${T.amber},${T.gold2},${T.emerald}); transition:width 1.6s cubic-bezier(.4,0,.2,1); }
        .mat-bar-fill::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent); animation:mat-sh 2.5s infinite; }
        .mat-ct::after { content:""; flex:1; height:1px; margin-left:10px; background:linear-gradient(90deg,rgba(255,255,255,.14),transparent); }
        @media (prefers-reduced-motion: reduce) { .mat-bf,.mat-bar-fill{transition:none} .mat-bar-fill::after{animation:none} .mat-dot{animation:none !important} }
      `}</style>

      <div className="relative overflow-hidden rounded-2xl border p-5 sm:p-7 space-y-6" style={{ background: T.bg, borderColor: T.border, color: T.text, fontFamily: "'Outfit',sans-serif" }}>
        {/* Logo Loyola em marca d'água — metade da tela, bem opaca */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-no-repeat opacity-[0.06] md:block" style={{ backgroundImage: "url('/logo.svg')", backgroundPosition: "center right", backgroundSize: "contain" }} />
        {/* Glows brand */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{
          background:
            `radial-gradient(600px 300px at 15% 0%, rgba(253,212,73,.10), transparent),` +
            `radial-gradient(500px 260px at 85% 10%, rgba(16,185,129,.09), transparent),` +
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
            <span className="text-[10px]" style={{ color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>{rows.length} dias · spend com imposto · CTR/CPC de link</span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.l} className="mat-kpi">
                <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-[12px]" style={{ background: k.g }} />
                <div className="mat-kpi-glow" style={{ background: k.g }} />
                <p className="text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>{k.l}</p>
                <p className="mt-1 font-extrabold" style={{ fontSize: "clamp(17px,2.1vw,26px)" }}>{k.v}</p>
                <p className="mt-0.5 text-[10px]" style={{ color: T.muted2 }}>{k.s}</p>
                <div className="mt-2 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
                  <div className="mat-bf" style={{ background: k.g, width: `${Math.max(4, Math.min(100, k.fill))}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Consistência (shimmer) */}
          <div className="rounded-[12px] border p-4" style={{ background: T.surface, borderColor: T.border }}>
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase" style={{ letterSpacing: "1px" }}>
              <span style={{ color: T.muted }}>Consistência — dias com leads ≥ média ({avgLeads.toFixed(1)}/dia)</span>
              <span style={{ color: T.emerald, fontFamily: "'JetBrains Mono',monospace" }}>{daysAboveAvg}/{rows.length} dias · {consistencyPct}%</span>
            </div>
            <div className="h-[10px] rounded-full" style={{ background: "rgba(255,255,255,.055)" }}>
              <div className="mat-bar-fill" style={{ width: `${consistencyPct}%` }} />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
              <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>
                Leads por dia — verde ≥ média · vermelho abaixo · fantasma ouro = média
              </p>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={chartData} barGap={2}>
                  <CartesianGrid stroke={T.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                  <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={34} />
                  <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(value, name) => [int(Number(value)), name === "meta" ? "Média" : "Leads"]} />
                  <Bar dataKey="meta" fill="rgba(253,212,73,.13)" stroke="rgba(253,212,73,.4)" strokeWidth={1} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="leads" radius={[3, 3, 0, 0]}>
                    {chartData.map((r) => <Cell key={r.date} fill={r.leads >= avgLeads ? "rgba(16,185,129,.55)" : "rgba(239,68,68,.5)"} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
              <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>CPL diário — vermelho acima da média</p>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke={T.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" />
                  <YAxis tick={{ fontSize: 10, fill: T.muted2, fontFamily: "'JetBrains Mono',monospace" }} stroke="transparent" width={40} />
                  <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(value) => [brl(Number(value)), "CPL"]} />
                  <Area dataKey="cpl" stroke="none" fill="rgba(245,158,11,.08)" connectNulls />
                  <Line dataKey="cpl" type="monotone" stroke={T.amber} strokeWidth={2} connectNulls
                    dot={(p: { cx?: number; cy?: number; payload?: DayRow; index?: number }) => {
                      const above = avgCpl != null && p.payload?.cpl != null && p.payload.cpl > avgCpl;
                      return <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={above ? T.red : T.amber} stroke="none" />;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Spend por dia (área ouro) */}
          <div className="rounded-[12px] border p-[17px]" style={{ background: T.surface, borderColor: T.border }}>
            <p className="mat-ct mb-3 flex items-center text-[9px] uppercase" style={{ color: T.muted, letterSpacing: "1px" }}>Investimento por dia (com imposto)</p>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData}>
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

          {/* Tabela diária */}
          <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: T.border }}>
            <table className="w-full text-right" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  {["Dia", "Invest", "Leads", "CPL", "CTR", "CPC", "CPM", "LP View", "Connect"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[8px] uppercase ${i === 0 ? "text-left" : ""}`} style={{ color: T.muted, letterSpacing: "1px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const isToday = r.date === today;
                  const good = r.leads >= avgLeads;
                  return (
                    <tr key={r.date} style={{ background: isToday ? "rgba(253,212,73,.06)" : good ? "rgba(16,185,129,.02)" : "rgba(239,68,68,.024)", outline: isToday ? `1px solid ${T.gold}66` : undefined, outlineOffset: -1, borderTop: `1px solid ${T.border}` }}>
                      <td className="px-3 py-1.5 text-left" style={{ color: isToday ? T.gold : T.muted2 }}>{r.label}{isToday ? " · hoje" : ""}</td>
                      <td className="px-3 py-1.5">{brl(r.spend)}</td>
                      <td className="px-3 py-1.5" style={{ color: good ? T.emerald : T.red }}>{int(r.leads)}</td>
                      <td className="px-3 py-1.5" style={{ color: avgCpl != null && r.cpl != null && r.cpl > avgCpl ? T.red : T.text }}>{r.cpl != null ? brl(r.cpl) : "—"}</td>
                      <td className="px-3 py-1.5">{pct(r.ctr)}</td>
                      <td className="px-3 py-1.5">{r.cpc != null ? brl(r.cpc) : "—"}</td>
                      <td className="px-3 py-1.5">{r.cpm != null ? brl(r.cpm) : "—"}</td>
                      <td className="px-3 py-1.5">{int(r.lpViews)}</td>
                      <td className="px-3 py-1.5">{pct(r.connect)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/** Aba: seletor de período (funciona — refetch por days) + a seção estilizada. */
export function MetaAdsTesteTab({ projectId, campaignIds }: { projectId: string; campaignIds: string[] }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useCampaignDailyInsightsBulk(projectId, campaignIds.length > 0 ? campaignIds : null, days);

  if (campaignIds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center text-sm text-muted-foreground">
        <FlaskConical className="mx-auto mb-2 h-6 w-6 text-cyan-400" />
        Vincule campanhas Meta a esta etapa (aba Meta Ads → Configurar) pra ver o experimento.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
      {isLoading ? <Skeleton className="h-[720px] rounded-2xl" /> : data ? <MetaAdsTesteSection data={data} /> : null}
    </div>
  );
}
