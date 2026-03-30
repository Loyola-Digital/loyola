"use client";

import { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Play,
  ImageIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTrafficAdSets,
  useTrafficAds,
  type CampaignAnalytics,
} from "@/lib/hooks/use-traffic-analytics";

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

interface FunnelCampaignTableProps {
  campaigns: CampaignAnalytics[];
  projectId: string;
  days: number;
}

export function FunnelCampaignTable({ campaigns, projectId, days }: FunnelCampaignTableProps) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<keyof CampaignAnalytics>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [campaigns, sortCol, sortDir]);

  function handleSort(col: keyof CampaignAnalytics) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const SortHeader = ({ label, col }: { label: string; col: keyof CampaignAnalytics }) => (
    <th
      className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2 cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortCol === col && <ArrowUpDown className="h-2.5 w-2.5" />}
      </span>
    </th>
  );

  if (campaigns.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Campanhas do Funil</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Nome</th>
              <SortHeader label="Spend" col="spend" />
              <SortHeader label="Impr" col="impressions" />
              <SortHeader label="Reach" col="reach" />
              <SortHeader label="Clicks" col="clicks" />
              <SortHeader label="CTR" col="ctr" />
              <SortHeader label="CPC" col="cpc" />
              <SortHeader label="CPM" col="cpm" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isExpanded = expandedCampaign === c.campaignId;
              return (
                <CampaignRow
                  key={c.campaignId}
                  campaign={c}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedCampaign(isExpanded ? null : c.campaignId)}
                  projectId={projectId}
                  days={days}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Campaign Row with expand
// ============================================================

function CampaignRow({
  campaign: c,
  isExpanded,
  onToggle,
  projectId,
  days,
}: {
  campaign: CampaignAnalytics;
  isExpanded: boolean;
  onToggle: () => void;
  projectId: string;
  days: number;
}) {
  return (
    <>
      <tr
        className="border-t border-border/20 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 px-3 text-xs font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="truncate max-w-[200px]">{c.campaignName}</span>
          </span>
        </td>
        <td className="py-2 px-2 text-xs text-right font-medium">{fmtCurrency(c.spend)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.impressions)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.reach)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.clicks)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.ctr)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpc)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpm)}</td>
      </tr>
      {isExpanded && (
        <DrillDownAdSets projectId={projectId} campaignId={c.campaignId} days={days} />
      )}
    </>
  );
}

// ============================================================
// Drill-down: AdSets → Ads
// ============================================================

function DrillDownAdSets({ projectId, campaignId, days }: { projectId: string; campaignId: string; days: number }) {
  const { data, isLoading } = useTrafficAdSets(projectId, campaignId, days);

  if (isLoading) return <tr><td colSpan={8} className="py-2 px-4"><Skeleton className="h-8" /></td></tr>;
  if (!data || data.adsets.length === 0) return <tr><td colSpan={8} className="py-2 px-8 text-xs text-muted-foreground">Nenhum ad set</td></tr>;

  return (
    <>
      {data.adsets.map((a) => (
        <DrillDownAdSetRow key={a.campaignId} adset={a} projectId={projectId} days={days} />
      ))}
    </>
  );
}

function DrillDownAdSetRow({ adset, projectId, days }: { adset: CampaignAnalytics; projectId: string; days: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-t border-border/10 bg-muted/20 hover:bg-muted/40 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-1.5 px-3 text-[11px] pl-8">
          <span className="inline-flex items-center gap-1">
            {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            <span className="truncate">{adset.campaignName}</span>
          </span>
        </td>
        <td className="py-1.5 px-2 text-[11px] text-right font-medium">{fmtCurrency(adset.spend)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.impressions)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.reach)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.clicks)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(adset.ctr)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(adset.cpc)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(adset.cpm)}</td>
      </tr>
      {expanded && <DrillDownAds projectId={projectId} adsetId={adset.campaignId} days={days} />}
    </>
  );
}

function DrillDownAds({ projectId, adsetId, days }: { projectId: string; adsetId: string; days: number }) {
  const { data, isLoading } = useTrafficAds(projectId, adsetId, days);

  if (isLoading) return <tr><td colSpan={8} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data || data.ads.length === 0) return <tr><td colSpan={8} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  return (
    <>
      {data.ads.map((a) => (
        <tr key={a.campaignId} className="border-t border-border/10 bg-muted/10 hover:bg-muted/30">
          <td className="py-1.5 px-3 text-[11px] pl-14">
            <span className="inline-flex items-center gap-2">
              {a.creative?.thumbnailUrl ? (
                <img src={a.creative.thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-muted/40 flex items-center justify-center shrink-0">
                  <ImageIcon className="h-3 w-3 text-muted-foreground/40" />
                </div>
              )}
              {a.creative?.objectType === "VIDEO" && (
                <Play className="h-3 w-3 text-muted-foreground absolute" />
              )}
              <span className="truncate">{a.campaignName}</span>
            </span>
          </td>
          <td className="py-1.5 px-2 text-[11px] text-right font-medium">{fmtCurrency(a.spend)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.impressions)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.reach)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.clicks)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(a.ctr)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(a.cpc)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(a.cpm)}</td>
        </tr>
      ))}
    </>
  );
}
