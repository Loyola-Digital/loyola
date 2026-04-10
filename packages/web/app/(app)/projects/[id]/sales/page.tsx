"use client";

import { use } from "react";
import {
  ArrowUpDown, TrendingUp, Users, Clock, ShoppingCart, Settings,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useSalesAscension } from "@/lib/hooks/use-sales";

interface Props { params: Promise<{ id: string }>; }

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function KpiCard({ icon: Icon, label, value, sub, gradient, border }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string;
  gradient?: string; border?: string;
}) {
  return (
    <div className={`rounded-xl border ${border ?? "border-border/30"} bg-gradient-to-br ${gradient ?? "from-card/80 to-card/40"} p-4`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ProjectSalesPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { data, isLoading } = useSalesAscension(projectId);

  const asc = data?.data;

  if (!isLoading && !asc) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <ArrowUpDown className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-semibold text-lg">Dados de vendas nao configurados</p>
        <p className="text-sm text-muted-foreground">{data?.message ?? "Configure produtos e planilhas em Settings → Vendas."}</p>
        <Button asChild><Link href="/settings/sales"><Settings className="h-4 w-4" />Configurar Vendas</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ArrowUpDown className="h-5 w-5" />
          Ascensao de Vendas
        </h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/sales"><Settings className="h-3.5 w-3.5" />Configurar</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : asc ? (
        <>
          {/* KPIs */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={ShoppingCart} label="Vendas Front-end" value={fmtNumber(asc.totalInferior)} sub={asc.inferiorProducts.join(", ")} gradient="from-blue-500/10 to-blue-600/5" border="border-blue-500/20" />
            <KpiCard icon={ShoppingCart} label="Vendas Back-end" value={fmtNumber(asc.totalSuperior)} sub={asc.superiorProducts.join(", ")} gradient="from-purple-500/10 to-purple-600/5" border="border-purple-500/20" />
            <KpiCard icon={TrendingUp} label="Ascenderam" value={fmtNumber(asc.totalAscended)} sub={`${asc.conversionRate.toFixed(1)}% de conversao`} gradient="from-emerald-500/10 to-emerald-600/5" border="border-emerald-500/20" />
            <KpiCard icon={Users} label="Taxa de Ascensao" value={`${asc.conversionRate.toFixed(1)}%`} sub="front-end → back-end" gradient={asc.conversionRate >= 10 ? "from-emerald-500/10 to-emerald-600/5" : asc.conversionRate >= 5 ? "from-amber-500/10 to-amber-600/5" : "from-red-500/10 to-red-600/5"} border={asc.conversionRate >= 10 ? "border-emerald-500/20" : asc.conversionRate >= 5 ? "border-amber-500/20" : "border-red-500/20"} />
            <KpiCard icon={Clock} label="Tempo Medio" value={`${asc.avgDaysToAscend}d`} sub="dias para ascender" gradient="from-amber-500/10 to-amber-600/5" border="border-amber-500/20" />
          </div>

          {/* Funnel visualization */}
          <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
            <h3 className="text-sm font-semibold mb-5">Funil de Ascensao</h3>
            <div className="space-y-3 max-w-xl mx-auto">
              {[
                { label: `Compraram Front-end`, value: asc.totalInferior, color: "bg-blue-500", pct: 100 },
                { label: `Compraram Back-end (total)`, value: asc.totalSuperior, color: "bg-purple-500", pct: asc.totalInferior > 0 ? (asc.totalSuperior / asc.totalInferior) * 100 : 0 },
                { label: `Ascenderam (front → back)`, value: asc.totalAscended, color: "bg-emerald-500", pct: asc.totalInferior > 0 ? (asc.totalAscended / asc.totalInferior) * 100 : 0 },
              ].map((stage, i) => {
                const width = Math.max(stage.pct, 8);
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{stage.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-bold">{fmtNumber(stage.value)}</span>
                        {i > 0 && <span className="text-xs text-muted-foreground">({stage.pct.toFixed(1)}%)</span>}
                      </div>
                    </div>
                    <div className="h-10 w-full rounded-lg bg-muted/20 overflow-hidden" style={{ display: "flex", justifyContent: "center" }}>
                      <div
                        className={`h-full ${stage.color}/70 rounded-lg transition-all duration-700`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                <span>Nao ascenderam:</span>
                <span className="font-semibold text-foreground">{fmtNumber(asc.totalInferior - asc.totalAscended)}</span>
                <span>({asc.totalInferior > 0 ? ((1 - asc.totalAscended / asc.totalInferior) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          </div>

          {/* Distribution chart */}
          {asc.distribution.some((d) => d.count > 0) && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
              <h3 className="text-sm font-semibold mb-4">Tempo para Ascensao</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={asc.distribution}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.2} />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#fff" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#fff" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
                  <Bar dataKey="count" fill="hsl(142 70% 45%)" radius={[6, 6, 0, 0]} name="Clientes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ascension table */}
          {asc.ascended.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden">
              <div className="px-5 py-3 border-b border-border/20">
                <h3 className="text-sm font-semibold">Clientes que Ascenderam</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/10 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      <th className="px-5 py-2.5 text-left font-medium">Email</th>
                      <th className="px-3 py-2.5 text-left font-medium">Front-end</th>
                      <th className="px-3 py-2.5 text-left font-medium">Data Inferior</th>
                      <th className="px-3 py-2.5 text-left font-medium">Back-end</th>
                      <th className="px-3 py-2.5 text-left font-medium">Data Superior</th>
                      <th className="px-3 py-2.5 text-right font-medium">Dias</th>
                      <th className="px-5 py-2.5 text-left font-medium">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asc.ascended.map((a, i) => (
                      <tr key={a.email} className={`border-b border-border/5 hover:bg-muted/20 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
                        <td className="px-5 py-2.5 text-xs">{a.email}</td>
                        <td className="px-3 py-2.5"><Badge variant="secondary" className="text-[9px]">{a.inferiorProduct}</Badge></td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{a.inferiorDate}</td>
                        <td className="px-3 py-2.5"><Badge className="text-[9px]">{a.superiorProduct}</Badge></td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{a.superiorDate}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-medium ${a.daysToAscend == null || isNaN(a.daysToAscend) ? "text-muted-foreground" : a.daysToAscend <= 7 ? "text-emerald-400" : a.daysToAscend <= 30 ? "text-amber-400" : "text-red-400"}`}>
                            {a.daysToAscend != null && !isNaN(a.daysToAscend) ? `${a.daysToAscend}d` : "—"}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-xs text-muted-foreground">{a.origin ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
