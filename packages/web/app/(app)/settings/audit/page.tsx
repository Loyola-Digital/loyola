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
} from "recharts";
import { Coins, DollarSign, MessageSquare, BookOpen } from "lucide-react";
import { useTokenAudit } from "@/lib/hooks/use-audit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number) {
  return `$${n.toFixed(4)}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{fmtDate(label)}</p>
      <p className="text-blue-400">Input: {fmt(payload[0]?.value ?? 0)}</p>
      <p className="text-brand">Output: {fmt(payload[1]?.value ?? 0)}</p>
    </div>
  );
}

export default function AuditPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useTokenAudit(days);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Auditoria de Tokens</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consumo de tokens Claude por usuário e Mind
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/30 p-1">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              onClick={() => setDays(p.value)}
              className={
                days === p.value
                  ? "bg-background shadow-sm text-foreground h-7 px-3 text-xs"
                  : "text-muted-foreground hover:text-foreground h-7 px-3 text-xs"
              }
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados de auditoria.</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              icon={<Coins className="h-4 w-4" />}
              label="Total de tokens"
              value={fmt(data.summary.totalTokens)}
              sub={`${fmt(data.summary.totalInputTokens)} input · ${fmt(data.summary.totalOutputTokens)} output`}
            />
            <SummaryCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Custo estimado"
              value={fmtCost(data.summary.estimatedCostUsd)}
              sub="Sonnet 4.6 pricing"
              accent
            />
            <SummaryCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="Mensagens"
              value={String(data.summary.messageCount)}
              sub={`${data.summary.conversationCount} conversas`}
            />
            <SummaryCard
              icon={<BookOpen className="h-4 w-4" />}
              label="Período"
              value={`${days}d`}
              sub={`${new Date(data.period.startDate).toLocaleDateString("pt-BR")} → hoje`}
            />
          </div>

          {/* Timeline chart */}
          {data.timeline.length > 0 ? (
            <div className="rounded-2xl border border-border/30 bg-card/60 p-5">
              <h2 className="text-sm font-semibold mb-4">Tokens por dia</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.timeline} barSize={8} barGap={2}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
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
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                  <Bar dataKey="inputTokens" stackId="a" fill="#60a5fa" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="outputTokens" stackId="a" fill="hsl(47, 98%, 54%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-end">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-blue-400" /> Input
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-brand" /> Output
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center text-sm text-muted-foreground">
              Nenhuma conversa no período selecionado.
            </div>
          )}

          {/* By user */}
          {data.byUser.length > 0 && (
            <div className="rounded-2xl border border-border/30 bg-card/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <h2 className="text-sm font-semibold">Por usuário</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20 text-xs text-muted-foreground/70">
                    <th className="px-5 py-2.5 text-left font-medium">Usuário</th>
                    <th className="px-5 py-2.5 text-right font-medium">Input</th>
                    <th className="px-5 py-2.5 text-right font-medium">Output</th>
                    <th className="px-5 py-2.5 text-right font-medium">Total</th>
                    <th className="px-5 py-2.5 text-right font-medium">Custo</th>
                    <th className="px-5 py-2.5 text-right font-medium">Msgs</th>
                    <th className="px-5 py-2.5 text-right font-medium">Convs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((u, i) => (
                    <tr
                      key={u.userId}
                      className={i % 2 === 0 ? "bg-muted/10" : ""}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium leading-tight">{u.userName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.userEmail}</div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground text-xs">{fmt(u.inputTokens)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground text-xs">{fmt(u.outputTokens)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(u.totalTokens)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-brand/90 font-medium">{fmtCost(u.estimatedCostUsd)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{u.messageCount}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{u.conversationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By mind */}
          {data.byMind.length > 0 && (
            <div className="rounded-2xl border border-border/30 bg-card/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <h2 className="text-sm font-semibold">Por Mind (top 10)</h2>
              </div>
              <div className="divide-y divide-border/20">
                {data.byMind.map((m) => {
                  const pct = data.summary.totalTokens > 0
                    ? Math.round((m.totalTokens / data.summary.totalTokens) * 100)
                    : 0;
                  return (
                    <div key={m.mindId} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{m.mindName}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {fmt(m.totalTokens)} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 space-y-2 ${accent ? "border-brand/30 bg-brand/5" : "border-border/30 bg-card/60"}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${accent ? "text-brand/80" : "text-muted-foreground"}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
