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
  Legend,
} from "recharts";
import { Coins, DollarSign, MessageSquare, Hash, Cpu } from "lucide-react";
import { useTokenAudit } from "@/lib/hooks/use-audit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PERIODS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 365 },
];

const MIND_COLORS = [
  "hsl(47 98% 54%)", "hsl(200 80% 60%)", "hsl(142 70% 45%)",
  "hsl(280 60% 55%)", "hsl(350 70% 55%)", "hsl(30 80% 55%)",
  "hsl(170 60% 45%)", "hsl(220 70% 55%)", "hsl(0 72% 55%)",
  "hsl(90 60% 45%)",
];

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number) {
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

export default function AuditPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useTokenAudit(days);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand">Loyola X Usage Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>RANGE</span>
          <div className="flex gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                onClick={() => setDays(p.value)}
                className={
                  days === p.value
                    ? "bg-brand text-brand-foreground h-7 px-3 text-xs"
                    : "text-muted-foreground hover:text-foreground h-7 px-3 text-xs"
                }
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados de auditoria.</p>
        </div>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="CONVERSAS" value={String(data.summary.conversationCount)} sub={`last ${days} days`} />
            <KpiCard label="MENSAGENS" value={fmt(data.summary.messageCount)} sub={`last ${days} days`} />
            <KpiCard label="INPUT TOKENS" value={fmt(data.summary.totalInputTokens)} sub={`last ${days} days`} />
            <KpiCard label="OUTPUT TOKENS" value={fmt(data.summary.totalOutputTokens)} sub={`last ${days} days`} />
            <KpiCard label="EST. COST" value={fmtCost(data.summary.estimatedCostUsd)} sub="API pricing" accent />
          </div>

          {/* Daily Token Usage Chart */}
          {data.timeline.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Daily Token Usage — Last {days} Days
                </h2>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" /> Input</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "hsl(47 98% 54%)" }} /> Output</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.timeline} barSize={days > 60 ? 4 : 10}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "#fff" }}
                    axisLine={false}
                    tickLine={false}
                    interval={days > 60 ? 6 : "preserveStartEnd"}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickFormatter={fmt}
                    tick={{ fontSize: 10, fill: "#fff" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
                    formatter={(value) => [fmt(Number(value)), "Tokens"]}
                    labelFormatter={(l) => fmtDate(String(l))}
                  />
                  <Bar dataKey="inputTokens" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="outputTokens" stackId="a" fill="hsl(47, 98%, 54%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bottom row: By Mind (donut) + Top Minds (bar) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Mind — Donut */}
            {data.byMind.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">By Mind</h2>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={data.byMind.slice(0, 8)}
                        dataKey="totalTokens"
                        nameKey="mindName"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        strokeWidth={2}
                      >
                        {data.byMind.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={MIND_COLORS[i % MIND_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", color: "#fff" }}
                        formatter={(v) => [fmt(Number(v)), "Tokens"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {data.byMind.slice(0, 8).map((m, i) => (
                      <div key={m.mindId} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: MIND_COLORS[i % MIND_COLORS.length] }} />
                        <span className="truncate flex-1">{m.mindName}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{fmt(m.totalTokens)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Top Minds — Horizontal Bar */}
            {data.byMind.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Top Minds by Tokens</h2>
                <div className="flex gap-4 text-xs mb-3">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" /> Input</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "hsl(280 60% 55%)" }} /> Output</span>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, data.byMind.slice(0, 10).length * 30)}>
                  <BarChart
                    data={data.byMind.slice(0, 10)}
                    layout="vertical"
                    margin={{ left: 100, right: 10 }}
                  >
                    <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#fff" }} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="mindName"
                      tick={{ fontSize: 10, fill: "#fff" }}
                      width={95}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", color: "#fff" }}
                      formatter={(v) => [fmt(Number(v)), "Tokens"]}
                    />
                    <Bar dataKey="inputTokens" stackId="a" fill="#60a5fa" />
                    <Bar dataKey="outputTokens" stackId="a" fill="hsl(280, 60%, 55%)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Users table */}
          {data.byUser.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Usage by User</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/20 text-[11px] text-muted-foreground/70">
                      <th className="px-5 py-2.5 text-left font-medium">Usuario</th>
                      <th className="px-3 py-2.5 text-right font-medium">Msgs</th>
                      <th className="px-3 py-2.5 text-right font-medium">Convs</th>
                      <th className="px-3 py-2.5 text-right font-medium">Input</th>
                      <th className="px-3 py-2.5 text-right font-medium">Output</th>
                      <th className="px-3 py-2.5 text-right font-medium">Total</th>
                      <th className="px-5 py-2.5 text-right font-medium">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((u, i) => (
                      <tr key={u.userId} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-sm leading-tight">{u.userName || "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{u.userEmail}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs">{u.messageCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs">{u.conversationCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs text-blue-400">{fmt(u.inputTokens)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs" style={{ color: "hsl(47 98% 54%)" }}>{fmt(u.outputTokens)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">{fmt(u.totalTokens)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-xs font-medium text-emerald-400">{fmtCost(u.estimatedCostUsd)}</td>
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

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/30 bg-card/60"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${accent ? "text-emerald-400" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
