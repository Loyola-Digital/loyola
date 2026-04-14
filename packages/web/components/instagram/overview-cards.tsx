"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, Eye,
  TrendingUp, Heart, Bookmark, Share2, Link2,
} from "lucide-react";
import type { InstagramProfile, InsightEntry } from "@/lib/hooks/use-instagram";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import type { MetricFormula } from "@/lib/types/metric-formula";
import {
  buildFollowersFormula,
  buildFollowersDeltaFormula,
  buildReachFormula,
  buildViewsFormula,
  buildInteractionsFormula,
  buildEngagementFormula,
  buildSavesFormula,
  buildSharesFormula,
  buildBioClicksFormula,
  type InstagramPeriod,
} from "@/lib/formulas/instagram";

interface OverviewCardsProps {
  profile?: InstagramProfile;
  insights?: InsightEntry[];
  isLoading: boolean;
  /** Período ativo do filtro — usado para compor o memorial de cada métrica. */
  period?: InstagramPeriod;
}

/** Extract a numeric value from an insight entry — handles both time_series and total_value formats */
function getInsightValue(entries: InsightEntry[] | undefined, name: string): number {
  if (!entries) return 0;
  const entry = entries.find((e) => e.name === name);
  if (!entry) return 0;

  // total_value format (v25 — most metrics)
  if (entry.total_value) {
    const tv = entry.total_value.value;
    if (typeof tv === "number") return tv;
    if (typeof tv === "object" && tv !== null) {
      return Object.values(tv as Record<string, number>).reduce((s, n) => s + (typeof n === "number" ? n : 0), 0);
    }
  }

  // time_series format (v25 — only reach)
  if (Array.isArray(entry.values) && entry.values.length > 0) {
    return entry.values.reduce((sum, v) => sum + (typeof v.value === "number" ? v.value : 0), 0);
  }

  return 0;
}

/** Get follows/unfollows breakdown from total_value */
function getFollowsBreakdown(entries: InsightEntry[] | undefined): { gained: number; lost: number } | null {
  if (!entries) return null;
  const entry = entries.find((e) => e.name === "follows_and_unfollows");
  if (!entry) return null;

  // total_value format: { value: { follow: N, unfollow: N } }
  const tv = entry.total_value?.value;
  if (tv && typeof tv === "object") {
    const fv = tv as Record<string, number>;
    return { gained: fv.follow ?? 0, lost: fv.unfollow ?? 0 };
  }

  // time_series fallback
  if (entry.values?.[0]?.value && typeof entry.values[0].value === "object") {
    const fv = entry.values[0].value as Record<string, number>;
    return { gained: fv.follow ?? 0, lost: fv.unfollow ?? 0 };
  }

  return null;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number): string {
  return `${val.toFixed(2)}%`;
}

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  gradient?: string;
  border?: string;
}

function KpiCard({ icon: Icon, label, value, sub, gradient = "from-card/80 to-card/40", border = "border-border/30" }: KpiProps) {
  return (
    <div className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-3 hover:border-border/50 transition-colors`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function OverviewCards({ profile, insights, isLoading, period }: OverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const followers = profile?.followers_count ?? 0;

  // Follows/unfollows breakdown
  const followsData = getFollowsBreakdown(insights);
  const followersDelta = followsData ? followsData.gained - followsData.lost : 0;
  const hasFollowData = !!followsData && (followsData.gained > 0 || followsData.lost > 0);

  // Core metrics
  const totalReach = getInsightValue(insights, "reach");
  const totalViews = getInsightValue(insights, "views");
  const totalInteractions = getInsightValue(insights, "total_interactions");
  const totalLikes = getInsightValue(insights, "likes");
  const totalComments = getInsightValue(insights, "comments");
  const totalSaves = getInsightValue(insights, "saves");
  const totalShares = getInsightValue(insights, "shares");
  const bioClicks = getInsightValue(insights, "profile_links_taps");

  const engagementRate = totalReach > 0 ? (totalInteractions / totalReach) * 100 : 0;

  interface CardDef {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    gradient?: string;
    border?: string;
    show: boolean;
    formula?: MetricFormula;
  }

  const cards: CardDef[] = [
    {
      icon: Users,
      label: "Seguidores",
      value: fmtNumber(followers),
      gradient: "from-blue-500/10 to-blue-600/5",
      border: "border-blue-500/20",
      show: true,
      formula: buildFollowersFormula(profile?.followers_count),
    },
    {
      icon: followersDelta >= 0 ? UserPlus : UserMinus,
      label: "Saldo Seguidores",
      value: `${followersDelta >= 0 ? "+" : ""}${fmtNumber(followersDelta)}`,
      sub: followsData ? `+${fmtNumber(followsData.gained)} / -${fmtNumber(followsData.lost)}` : undefined,
      gradient: followersDelta >= 0 ? "from-emerald-500/10 to-emerald-600/5" : "from-red-500/10 to-red-600/5",
      border: followersDelta >= 0 ? "border-emerald-500/20" : "border-red-500/20",
      show: hasFollowData,
      formula: followsData && period
        ? buildFollowersDeltaFormula(followsData.gained, followsData.lost, period)
        : undefined,
    },
    {
      icon: Eye,
      label: "Alcance",
      value: fmtNumber(totalReach),
      gradient: "from-cyan-500/10 to-cyan-600/5",
      border: "border-cyan-500/20",
      show: totalReach > 0,
      formula: period ? buildReachFormula(totalReach, period) : undefined,
    },
    {
      icon: Eye,
      label: "Visualizacoes",
      value: fmtNumber(totalViews),
      gradient: "from-purple-500/10 to-purple-600/5",
      border: "border-purple-500/20",
      show: totalViews > 0,
      formula: period ? buildViewsFormula(totalViews, period) : undefined,
    },
    {
      icon: Heart,
      label: "Interacoes",
      value: fmtNumber(totalInteractions),
      sub: totalLikes > 0 ? `${fmtNumber(totalLikes)} likes · ${fmtNumber(totalComments)} comments` : undefined,
      gradient: "from-pink-500/10 to-pink-600/5",
      border: "border-pink-500/20",
      show: totalInteractions > 0,
      formula: period
        ? buildInteractionsFormula(totalInteractions, totalLikes, totalComments, period)
        : undefined,
    },
    {
      icon: TrendingUp,
      label: "Engajamento",
      value: fmtPercent(engagementRate),
      sub: "interacoes / alcance",
      gradient: "from-amber-500/10 to-amber-600/5",
      border: "border-amber-500/20",
      show: engagementRate > 0,
      formula: period
        ? buildEngagementFormula(totalInteractions, totalReach, period)
        : undefined,
    },
    {
      icon: Bookmark,
      label: "Salvamentos",
      value: fmtNumber(totalSaves),
      gradient: "from-indigo-500/10 to-indigo-600/5",
      border: "border-indigo-500/20",
      show: totalSaves > 0,
      formula: period ? buildSavesFormula(totalSaves, period) : undefined,
    },
    {
      icon: Share2,
      label: "Compartilhamentos",
      value: fmtNumber(totalShares),
      gradient: "from-teal-500/10 to-teal-600/5",
      border: "border-teal-500/20",
      show: totalShares > 0,
      formula: period ? buildSharesFormula(totalShares, period) : undefined,
    },
    {
      icon: Link2,
      label: "Cliques na Bio",
      value: fmtNumber(bioClicks),
      gradient: "from-orange-500/10 to-orange-600/5",
      border: "border-orange-500/20",
      show: bioClicks > 0,
      formula: period ? buildBioClicksFormula(bioClicks, period) : undefined,
    },
  ].filter((c) => c.show);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, minmax(0, 1fr))` }}>
      {cards.map((c) => (
        <MetricTooltip key={c.label} label={c.label} value={c.value} formula={c.formula}>
          <KpiCard icon={c.icon} label={c.label} value={c.value} sub={c.sub} gradient={c.gradient} border={c.border} />
        </MetricTooltip>
      ))}
    </div>
  );
}
