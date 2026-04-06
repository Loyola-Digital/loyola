"use client";

import { useState, useMemo } from "react";
import {
  Youtube,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Eye,
  Play,
  Target,
  Percent,
  MousePointerClick,
  Settings,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  useGoogleAdsCampaigns,
  useGoogleAdsDailyInsights,
} from "@/lib/hooks/use-google-ads-analytics";
import {
  useGoogleAdsCampaignPicker,
  useUpdateFunnel,
} from "@/lib/hooks/use-funnels";
import type { Funnel } from "@loyola-x/shared";
import Link from "next/link";
import { toast } from "sonner";

function fmtCurrency(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

function fmtNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}%`;
}

interface YouTubeFunnelSectionProps {
  funnel: Funnel;
  projectId: string;
  days: number;
}

export function YouTubeFunnelSection({ funnel, projectId, days }: YouTubeFunnelSectionProps) {
  const [open, setOpen] = useState(funnel.googleAdsCampaigns.length > 0);
  const { data: pickerData } = useGoogleAdsCampaignPicker(projectId);
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);

  const hasYouTube = funnel.googleAdsCampaigns.length > 0;
  const accountId = funnel.googleAdsAccountId ?? pickerData?.accountId ?? null;
  const campaignIdSet = useMemo(() => new Set(funnel.googleAdsCampaigns.map((c) => c.id)), [funnel.googleAdsCampaigns]);

  function handleAddCampaign(campaign: { id: string; name: string }) {
    if (funnel.googleAdsCampaigns.some((c) => c.id === campaign.id)) return;
    const updated = [...funnel.googleAdsCampaigns, campaign];
    updateFunnel.mutate(
      { googleAdsCampaigns: updated, googleAdsAccountId: accountId },
      { onSuccess: () => toast.success("Campanha YouTube adicionada!") }
    );
  }

  function handleRemoveCampaign(campaignId: string) {
    const updated = funnel.googleAdsCampaigns.filter((c) => c.id !== campaignId);
    updateFunnel.mutate(
      { googleAdsCampaigns: updated },
      { onSuccess: () => toast.success("Campanha removida.") }
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Youtube className="h-4 w-4 text-red-500" />
          <span className="text-sm font-semibold">YouTube Ads</span>
          {hasYouTube && (
            <Badge variant="secondary" className="text-[10px]">
              {funnel.googleAdsCampaigns.length} campanha{funnel.googleAdsCampaigns.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/20 p-5 space-y-4">
          {!pickerData?.accountLinked ? (
            <div className="text-center py-4 space-y-2">
              <Youtube className="h-6 w-6 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhuma conta Google Ads vinculada a este projeto.</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/google-ads">
                  <Settings className="h-3.5 w-3.5" />
                  Configurar Google Ads
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Selected campaigns */}
              {funnel.googleAdsCampaigns.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {funnel.googleAdsCampaigns.map((c) => (
                    <Badge key={c.id} variant="secondary" className="flex items-center gap-1 pr-1">
                      <Youtube className="h-3 w-3 text-red-500" />
                      {c.name}
                      <button onClick={() => handleRemoveCampaign(c.id)} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20">
                        <span className="text-destructive/70 text-xs">x</span>
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add campaign */}
              {pickerData?.campaigns && (
                <Select onValueChange={(v) => {
                  const c = pickerData.campaigns.find((c) => c.id === v);
                  if (c) handleAddCampaign({ id: c.id, name: c.name });
                }}>
                  <SelectTrigger className="h-8 w-[280px] text-xs">
                    <SelectValue placeholder="Adicionar campanha YouTube..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pickerData.campaigns
                      .filter((c) => !campaignIdSet.has(c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}

          {/* Dashboard filtered by selected campaigns */}
          {hasYouTube && accountId && (
            <YouTubeFunnelDashboard accountId={accountId} days={days} campaignIds={campaignIdSet} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD (filtered by selected campaigns)
// ============================================================

function YouTubeFunnelDashboard({ accountId, days, campaignIds }: { accountId: string; days: number; campaignIds: Set<string> }) {
  const { data: campaignData, isLoading } = useGoogleAdsCampaigns(accountId, days);
  const firstCampaignId = campaignIds.size > 0 ? Array.from(campaignIds)[0] : undefined;
  const { data: dailyData, isLoading: dailyLoading } = useGoogleAdsDailyInsights(accountId, days, firstCampaignId);

  // Filter and aggregate only selected campaigns
  const overview = useMemo(() => {
    if (!campaignData?.campaigns) return null;
    const filtered = campaignData.campaigns.filter((c) => campaignIds.has(c.id));
    if (filtered.length === 0) return null;

    const totalSpend = filtered.reduce((s, c) => s + c.spend, 0);
    const totalViews = filtered.reduce((s, c) => s + c.views, 0);
    const totalImpressions = filtered.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = filtered.reduce((s, c) => s + c.clicks, 0);
    const totalConversions = filtered.reduce((s, c) => s + c.conversions, 0);

    return {
      totalSpend,
      totalViews,
      cpv: totalViews > 0 ? totalSpend / totalViews : null,
      viewRate: totalImpressions > 0 ? (totalViews / totalImpressions) * 100 : null,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      conversions: totalConversions,
      campaigns: filtered,
    };
  }, [campaignData, campaignIds]);

  if (isLoading) return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
    </div>
  );

  if (!overview) return null;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniKpi icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
        <MiniKpi icon={Play} label="Views" value={fmtNumber(overview.totalViews)} />
        <MiniKpi icon={Target} label="CPV" value={fmtCurrency(overview.cpv)} />
        <MiniKpi icon={Eye} label="View Rate" value={fmtPercent(overview.viewRate)} />
        <MiniKpi icon={Percent} label="CTR" value={fmtPercent(overview.ctr)} />
        <MiniKpi icon={MousePointerClick} label="CPC" value={fmtCurrency(overview.cpc)} />
      </div>

      {/* Daily chart */}
      {dailyLoading ? (
        <Skeleton className="h-48" />
      ) : dailyData && dailyData.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold mb-2">Spend & Views Diarios</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData.map((d) => ({ date: d.date.slice(5, 10), spend: d.spend, views: d.views }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="spend" tick={{ fontSize: 10, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
              <YAxis yAxisId="views" orientation="right" tick={{ fontSize: 10, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px", color: "#fff" }} />
              <Legend wrapperStyle={{ color: "#fff" }} />
              <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Spend (R$)" />
              <Line yAxisId="views" type="monotone" dataKey="views" stroke="hsl(0 72% 55%)" strokeWidth={2} dot={false} name="Views" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Campaign table (only selected ones) */}
      {overview.campaigns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">Campanha</th>
                <th className="text-right py-2 font-medium">Spend</th>
                <th className="text-right py-2 font-medium">Views</th>
                <th className="text-right py-2 font-medium">CPV</th>
                <th className="text-right py-2 font-medium">View Rate</th>
                <th className="text-right py-2 font-medium">CTR</th>
              </tr>
            </thead>
            <tbody>
              {overview.campaigns.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 text-xs">{c.name}</td>
                  <td className="text-right tabular-nums text-xs">{fmtCurrency(c.spend)}</td>
                  <td className="text-right tabular-nums text-xs">{fmtNumber(c.views)}</td>
                  <td className="text-right tabular-nums text-xs">{fmtCurrency(c.cpv)}</td>
                  <td className="text-right tabular-nums text-xs">{fmtPercent(c.viewRate)}</td>
                  <td className="text-right tabular-nums text-xs">{fmtPercent(c.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/20 bg-muted/10 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3 w-3 text-muted-foreground/50" />
      </div>
      <p className="text-base font-bold tracking-tight">{value}</p>
    </div>
  );
}
