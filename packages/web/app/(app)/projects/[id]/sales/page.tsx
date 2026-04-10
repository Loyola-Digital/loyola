"use client";

import { use, useState } from "react";
import {
  ArrowUpDown, TrendingUp, Users, Clock, ShoppingCart, Settings, DollarSign, Download, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, Area, AreaChart,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useSalesAscension } from "@/lib/hooks/use-sales";

interface Props { params: Promise<{ id: string }>; }

function fmt(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtCurrency(val: number): string {
  if (val === 0) return "—";
  return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard({ icon: Icon, label, value, sub, gradient = "from-card/80 to-card/40", border = "border-border/30" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; gradient?: string; border?: string;
}) {
  return (
    <div className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-4`}>
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
  const [showRemarketing, setShowRemarketing] = useState(false);

  const asc = data?.data;

  if (!isLoading && !asc) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><ArrowUpDown className="h-8 w-8 text-muted-foreground" /></div>
        <p className="font-semibold text-lg">Dados de vendas nao configurados</p>
        <p className="text-sm text-muted-foreground">{data?.message ?? "Configure em Settings → Vendas."}</p>
        <Button asChild><Link href="/settings/sales"><Settings className="h-4 w-4" />Configurar</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><ArrowUpDown className="h-5 w-5" />Ascensao de Vendas</h1>
        <Button variant="outline" size="sm" asChild><Link href="/settings/sales"><Settings className="h-3.5 w-3.5" />Configurar</Link></Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : asc ? (
        <>
          {/* Row 1: Volume KPIs */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={ShoppingCart} label="Vendas Front" value={fmt(asc.totalInferior)} sub={asc.inferiorProducts.join(", ")} gradient="from-blue-500/10 to-blue-600/5" border="border-blue-500/20" />
            <KpiCard icon={ShoppingCart} label="Vendas Back" value={fmt(asc.totalSuperior)} sub={asc.superiorProducts.join(", ")} gradient="from-purple-500/10 to-purple-600/5" border="border-purple-500/20" />
            <KpiCard icon={TrendingUp} label="Ascenderam" value={fmt(asc.totalAscended)} sub={`${asc.conversionRate.toFixed(1)}% conversao`} gradient="from-emerald-500/10 to-emerald-600/5" border="border-emerald-500/20" />
            <KpiCard icon={Users} label="Taxa Ascensao" value={`${asc.conversionRate.toFixed(1)}%`} sub="front → back" gradient={asc.conversionRate >= 10 ? "from-emerald-500/10 to-emerald-600/5" : "from-amber-500/10 to-amber-600/5"} border={asc.conversionRate >= 10 ? "border-emerald-500/20" : "border-amber-500/20"} />
            <KpiCard icon={Clock} label="Tempo Medio" value={`${asc.avgDaysToAscend}d`} sub="para ascender" gradient="from-amber-500/10 to-amber-600/5" border="border-amber-500/20" />
          </div>

          {/* Row 2: Revenue KPIs */}
          {(asc.revenueInferior > 0 || asc.revenueSuperior > 0) && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={DollarSign} label="Receita Front" value={fmtCurrency(asc.revenueInferior)} gradient="from-blue-500/10 to-blue-600/5" border="border-blue-500/20" />
              <KpiCard icon={DollarSign} label="Receita Back" value={fmtCurrency(asc.revenueSuperior)} gradient="from-purple-500/10 to-purple-600/5" border="border-purple-500/20" />
              <KpiCard icon={DollarSign} label="Ticket Medio Front" value={fmtCurrency(asc.ticketMedioInferior)} gradient="from-cyan-500/10 to-cyan-600/5" border="border-cyan-500/20" />
              <KpiCard icon={DollarSign} label="LTV Estimado" value={fmtCurrency(asc.ltvEstimado)} sub="front + back por cliente" gradient="from-emerald-500/10 to-emerald-600/5" border="border-emerald-500/20" />
            </div>
          )}

          {/* Funnel */}
          <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-6">
            <h3 className="text-sm font-semibold mb-6">Funil de Ascensao</h3>
            <div className="flex flex-col items-center gap-0 max-w-lg mx-auto">
              {[
                { label: "Compraram Front-end", value: asc.totalInferior, pct: 100, color: "from-blue-500 to-blue-600" },
                { label: "Compraram Back-end", value: asc.totalSuperior, pct: asc.totalInferior > 0 ? (asc.totalSuperior / asc.totalInferior) * 100 : 0, color: "from-purple-500 to-purple-600" },
                { label: "Ascenderam", value: asc.totalAscended, pct: asc.totalInferior > 0 ? (asc.totalAscended / asc.totalInferior) * 100 : 0, color: "from-emerald-500 to-emerald-600" },
              ].map((stage, i, arr) => {
                const w = Math.max(stage.pct, 15);
                const nw = i < arr.length - 1 ? Math.max(arr[i + 1].pct, 15) : w * 0.7;
                return (
                  <div key={i} className="w-full flex flex-col items-center">
                    <div style={{ width: `${w}%`, minWidth: "120px" }} className="transition-all duration-700">
                      <div className={`bg-gradient-to-r ${stage.color} rounded-lg py-4 px-4 text-center`} style={{ clipPath: `polygon(0 0, 100% 0, ${50 + (nw / w) * 50}% 100%, ${50 - (nw / w) * 50}% 100%)` }}>
                        <p className="text-white text-2xl font-bold">{fmt(stage.value)}</p>
                        <p className="text-white/80 text-xs">{stage.label}</p>
                        {i > 0 && <p className="text-white/60 text-[10px]">{stage.pct.toFixed(1)}%</p>}
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="py-1 text-[10px] text-muted-foreground">{arr[i + 1].pct.toFixed(1)}% ↓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline — sales per day */}
          {asc.timeline.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
              <h3 className="text-sm font-semibold mb-4">Vendas por Dia</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={asc.timeline}>
                  <defs>
                    <linearGradient id="frontGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="backGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} strokeDasharray="4 4" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5, 10)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
                  <Legend wrapperStyle={{ color: "#fff" }} />
                  <Area type="monotone" dataKey="front" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#frontGrad)" name="Front-end" />
                  <Area type="monotone" dataKey="back" stackId="1" stroke="#8b5cf6" strokeWidth={2} fill="url(#backGrad)" name="Back-end" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row: Cohort + Top Origins */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cohort by month */}
            {asc.cohort.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
                <h3 className="text-sm font-semibold mb-4">Cohort Mensal</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={asc.cohort}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} />
                    <XAxis dataKey="month" tickFormatter={(m) => m.slice(2)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px", color: "#fff" }} />
                    <Legend wrapperStyle={{ color: "#fff" }} />
                    <Bar dataKey="total" fill="#3b82f6" name="Compraram front" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ascended" fill="#10b981" name="Ascenderam" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top origins */}
            {asc.topOrigins.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
                <h3 className="text-sm font-semibold mb-4">Top Origens que Ascendem</h3>
                <div className="space-y-2">
                  {asc.topOrigins.filter((o) => o.ascended > 0).map((o, i) => (
                    <div key={o.origin} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium truncate">{o.origin}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{o.ascended}/{o.total} ({o.rate.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${o.rate}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top UTM Campaigns */}
          {asc.topCampaigns && asc.topCampaigns.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
              <h3 className="text-sm font-semibold mb-4">Top UTM Campaigns</h3>
              <div className="space-y-2">
                {asc.topCampaigns.map((c, i) => (
                  <div key={c.campaign} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate">{c.campaign}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{c.ascended}/{c.total} ({c.rate.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${Math.max(c.rate, 2)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distribution */}
          {asc.distribution.some((d) => d.count > 0) && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
              <h3 className="text-sm font-semibold mb-4">Tempo para Ascensao</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={asc.distribution}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} name="Clientes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Remarketing list */}
          {asc.remarketing.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden">
              <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20" onClick={() => setShowRemarketing(!showRemarketing)}>
                <div className="flex items-center gap-2">
                  {showRemarketing ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="text-sm font-semibold">Remarketing — Nao Ascenderam</span>
                  <Badge variant="secondary" className="text-[10px]">{asc.remarketing.length} emails</Badge>
                </div>
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => {
                  e.stopPropagation();
                  const csv = "Email,Data,Produto,Origem,UTM Source,UTM Campaign\n" + asc.remarketing.map((r) => `${r.email},${r.date},${r.product},${r.origin ?? ""},${r.utm_source ?? ""},${r.utm_campaign ?? ""}`).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "remarketing.csv"; a.click();
                }}>
                  <Download className="h-3 w-3" />
                  Exportar CSV
                </Button>
              </button>
              {showRemarketing && (
                <div className="border-t border-border/20 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/10 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        <th className="px-5 py-2 text-left font-medium">Email</th>
                        <th className="px-3 py-2 text-left font-medium">Data Compra</th>
                        <th className="px-3 py-2 text-left font-medium">Produto</th>
                        <th className="px-3 py-2 text-left font-medium">Origem</th>
                        <th className="px-3 py-2 text-left font-medium">UTM Source</th>
                        <th className="px-5 py-2 text-left font-medium">UTM Campaign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asc.remarketing.slice(0, 50).map((r, i) => (
                        <tr key={r.email} className={`border-b border-border/5 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
                          <td className="px-5 py-2 text-xs">{r.email}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.date}</td>
                          <td className="px-3 py-2"><Badge variant="secondary" className="text-[9px]">{r.product}</Badge></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.origin ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.utm_source ?? "—"}</td>
                          <td className="px-5 py-2 text-xs text-muted-foreground">{r.utm_campaign ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {asc.remarketing.length > 50 && (
                    <p className="px-5 py-2 text-xs text-muted-foreground">Mostrando 50 de {asc.remarketing.length} — exporte CSV pra ver todos</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ascended table */}
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
                      <th className="px-3 py-2.5 text-left font-medium">Data</th>
                      <th className="px-3 py-2.5 text-left font-medium">Back-end</th>
                      <th className="px-3 py-2.5 text-left font-medium">Data</th>
                      <th className="px-3 py-2.5 text-right font-medium">Dias</th>
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
                          <span className={`text-xs font-medium ${a.daysToAscend != null && !isNaN(a.daysToAscend) ? (a.daysToAscend <= 7 ? "text-emerald-400" : a.daysToAscend <= 30 ? "text-amber-400" : "text-red-400") : "text-muted-foreground"}`}>
                            {a.daysToAscend != null && !isNaN(a.daysToAscend) ? `${a.daysToAscend}d` : "—"}
                          </span>
                        </td>
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
