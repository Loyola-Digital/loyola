"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTokenAudit } from "@/lib/hooks/use-audit";

const PERIODS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 365 },
];

const MIND_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6",
  "#ef4444", "#f97316", "#06b6d4", "#ec4899",
  "#84cc16", "#6366f1",
];

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number) {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DailyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm px-4 py-3 shadow-2xl">
      <p className="text-xs font-medium text-muted-foreground mb-2">{String(label).slice(0, 10)}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name === "inputTokens" ? "Input" : "Output"}
          </span>
          <span className="font-semibold tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MindTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm px-4 py-3 shadow-2xl">
      <p className="text-xs font-medium mb-1">{d.name}</p>
      <p className="text-sm font-semibold">{fmt(d.value)} tokens</p>
    </div>
  );
}

export default function AuditPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useTokenAudit(days);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-brand to-amber-400 bg-clip-text text-transparent">
            Loyola X Usage Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Consumo de tokens e custos estimados</p>
        </div>
        <div className="flex gap-0.5 rounded-full border border-border/40 bg-muted/20 p-1">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              onClick={() => setDays(p.value)}
              className={`rounded-full h-7 px-4 text-xs transition-all ${
                days === p.value
                  ? "bg-brand text-brand-foreground shadow-md shadow-brand/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados.</p>
        </div>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <GlassCard label="Conversas" value={String(data.summary.conversationCount)} sub={`ultimos ${days} dias`} gradient="from-blue-500/10 to-blue-600/5" border="border-blue-500/20" />
            <GlassCard label="Mensagens" value={fmt(data.summary.messageCount)} sub={`ultimos ${days} dias`} gradient="from-purple-500/10 to-purple-600/5" border="border-purple-500/20" />
            <GlassCard label="Input Tokens" value={fmt(data.summary.totalInputTokens)} sub={`ultimos ${days} dias`} gradient="from-cyan-500/10 to-cyan-600/5" border="border-cyan-500/20" />
            <GlassCard label="Output Tokens" value={fmt(data.summary.totalOutputTokens)} sub={`ultimos ${days} dias`} gradient="from-amber-500/10 to-amber-600/5" border="border-amber-500/20" />
            <GlassCard label="Est. Cost" value={fmtCost(data.summary.estimatedCostUsd)} sub="API pricing" gradient="from-emerald-500/10 to-emerald-600/5" border="border-emerald-500/20" accent />
          </div>

          {/* Daily Token Usage — Area Chart */}
          {data.timeline.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-gradient-to-br from-card/80 to-card/40 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold">Tokens por Dia</h2>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Input</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Output</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.timeline}>
                  <defs>
                    <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => String(d).slice(5, 10)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={fmt}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<DailyTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="inputTokens" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#inputGrad)" />
                  <Area type="monotone" dataKey="outputTokens" stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#outputGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bottom: Donut + Horizontal Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut by Mind */}
            {data.byMind.length > 0 && (
              <div className="rounded-2xl border border-border/20 bg-gradient-to-br from-card/80 to-card/40 p-6">
                <h2 className="text-sm font-semibold mb-4">Por Mind</h2>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={data.byMind.slice(0, 8)}
                        dataKey="totalTokens"
                        nameKey="mindName"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        strokeWidth={0}
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {data.byMind.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={MIND_COLORS[i % MIND_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<MindTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1 min-w-0">
                    {data.byMind.slice(0, 8).map((m, i) => {
                      const pct = data.summary.totalTokens > 0 ? ((m.totalTokens / data.summary.totalTokens) * 100) : 0;
                      return (
                        <div key={m.mindId} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md shrink-0" style={{ backgroundColor: MIND_COLORS[i % MIND_COLORS.length] }} />
                          <span className="text-xs truncate flex-1">{m.mindName}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Top Minds Bar */}
            {data.byMind.length > 0 && (
              <div className="rounded-2xl border border-border/20 bg-gradient-to-br from-card/80 to-card/40 p-6">
                <h2 className="text-sm font-semibold mb-4">Top Minds por Tokens</h2>
                <ResponsiveContainer width="100%" height={Math.max(180, data.byMind.slice(0, 8).length * 32)}>
                  <BarChart data={data.byMind.slice(0, 8)} layout="vertical" margin={{ left: 80, right: 10 }}>
                    <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="mindName" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={75} axisLine={false} tickLine={false} />
                    <Tooltip content={<MindTooltip />} cursor={{ fill: "hsl(var(--muted)/0.2)" }} />
                    <Bar dataKey="inputTokens" stackId="a" fill="#3b82f6" radius={0} />
                    <Bar dataKey="outputTokens" stackId="a" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Input</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> Output</span>
                </div>
              </div>
            )}
          </div>

          {/* Users table */}
          {data.byUser.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-border/20">
                <h2 className="text-sm font-semibold">Uso por Usuario</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/10 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      <th className="px-6 py-3 text-left font-medium">Usuario</th>
                      <th className="px-3 py-3 text-right font-medium">Msgs</th>
                      <th className="px-3 py-3 text-right font-medium">Convs</th>
                      <th className="px-3 py-3 text-right font-medium">Input</th>
                      <th className="px-3 py-3 text-right font-medium">Output</th>
                      <th className="px-3 py-3 text-right font-medium">Total</th>
                      <th className="px-6 py-3 text-right font-medium">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((u, i) => (
                      <tr key={u.userId} className={`border-b border-border/5 transition-colors hover:bg-muted/20 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
                        <td className="px-6 py-3">
                          <div className="text-sm font-medium">{u.userName || "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{u.userEmail}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground">{u.messageCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground">{u.conversationCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs text-blue-400">{fmt(u.inputTokens)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs text-amber-400">{fmt(u.outputTokens)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">{fmt(u.totalTokens)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-xs font-medium text-emerald-400">{fmtCost(u.estimatedCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GlassCard({ label, value, sub, gradient, border, accent }: {
  label: string; value: string; sub?: string; gradient: string; border: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl ${border} bg-gradient-to-br ${gradient} p-4 backdrop-blur-sm`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80 mb-2">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${accent ? "text-emerald-400" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-1">{sub}</p>}
    </div>
  );
}
