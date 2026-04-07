"use client";

import { use, useState, useMemo } from "react";
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  TrendingUp,
  Radio,
  Users,
  Repeat,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaAdsAccounts } from "@/lib/hooks/use-meta-ads";
import {
  useTrafficCampaigns,
  type CampaignAnalyticsResponse,
} from "@/lib/hooks/use-traffic-analytics";
import { FunnelCampaignTable } from "@/components/funnels/funnel-campaign-table";

interface Props {
  params: Promise<{ id: string }>;
}

function fmtCurrency(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

function fmtNumber(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)}%`;
}

const PERIOD_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

export default function ProjectTrafficPage({ params }: Props) {
  const { id: projectId } = use(params);
  const [days, setDays] = useState(30);
  const [isCustom, setIsCustom] = useState(false);
  const [customDays, setCustomDays] = useState("");

  const { data: accounts } = useMetaAdsAccounts();
  const linkedAccount = accounts?.find((a) =>
    a.projects.some((p) => p.projectId === projectId)
  );

  const { data: campaignData, isLoading } = useTrafficCampaigns(
    linkedAccount ? projectId : null,
    days > 0 ? days : 30
  );

  const totals = useMemo(() => {
    if (!campaignData) return null;
    return campaignData.campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        reach: acc.reach + c.reach,
        leads: acc.leads + (c.leads ?? 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 }
    );
  }, [campaignData]);

  if (!linkedAccount && accounts) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <TrendingUp className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-semibold text-lg">Nenhuma conta Meta Ads vinculada</p>
        <p className="text-sm text-muted-foreground">Conecte uma conta em Settings e vincule a este projeto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Meta Ads
        </h1>
        <div className="flex items-center gap-2">
          <Select
            value={isCustom ? "custom" : String(days)}
            onValueChange={(v) => {
              if (v === "custom") { setIsCustom(true); setCustomDays(""); }
              else { setIsCustom(false); setDays(Number(v)); }
            }}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={365} autoFocus
                value={customDays}
                onChange={(e) => { setCustomDays(e.target.value); const v = parseInt(e.target.value); if (v > 0 && v <= 365) setDays(v); }}
                placeholder="Dias"
                className="w-[70px] h-8 rounded-md border border-border bg-card px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : totals ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(totals.spend)} />
          <KpiCard icon={Eye} label="Impressoes" value={fmtNumber(totals.impressions)} />
          <KpiCard icon={Radio} label="Alcance" value={fmtNumber(totals.reach)} />
          <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNumber(totals.clicks)} />
          <KpiCard icon={Percent} label="CTR" value={fmtPercent(totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0)} />
          <KpiCard icon={Users} label="Leads" value={fmtNumber(totals.leads)} />
        </div>
      ) : null}

      {/* Campaign table */}
      {campaignData && campaignData.campaigns.length > 0 && (
        <FunnelCampaignTable campaigns={campaignData.campaigns} projectId={projectId} days={days > 0 ? days : 30} />
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
