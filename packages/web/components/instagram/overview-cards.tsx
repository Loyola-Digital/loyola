"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, Eye, MousePointerClick,
  TrendingUp, Heart,
} from "lucide-react";
import type { InstagramProfile, InsightEntry } from "@/lib/hooks/use-instagram";

interface OverviewCardsProps {
  profile?: InstagramProfile;
  insights?: InsightEntry[];
  isLoading: boolean;
}

function sumInsightValues(entries: InsightEntry[] | undefined, name: string): number {
  if (!entries) return 0;
  const entry = entries.find((e) => e.name === name);
  if (!entry || !Array.isArray(entry.values)) return 0;
  return entry.values.reduce((sum, v) => sum + (typeof v.value === "number" ? v.value : 0), 0);
}

function getFollowerTimeSeries(entries: InsightEntry[] | undefined): { first: number; last: number } | null {
  if (!entries) return null;
  const entry = entries.find((e) => e.name === "follower_count");
  if (!entry || !Array.isArray(entry.values) || entry.values.length < 2) return null;
  const values = entry.values.filter((v) => typeof v.value === "number").map((v) => v.value as number);
  if (values.length < 2) return null;
  return { first: values[0], last: values[values.length - 1] };
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

export function OverviewCards({ profile, insights, isLoading }: OverviewCardsProps) {
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

  // Saldo de seguidores: prefer follows_and_unfollows (total_value), fallback to follower_count series
  const followsEntry = insights?.find((e) => e.name === "follows_and_unfollows");
  const followerSeries = getFollowerTimeSeries(insights);

  let followersDelta = 0;
  let followsGained = 0;
  let followsLost = 0;
  let hasFollowData = false;

  if (followsEntry?.values?.[0]?.value && typeof followsEntry.values[0].value === "object") {
    // v25: follows_and_unfollows returns {follow: N, unfollow: N}
    const fv = followsEntry.values[0].value as Record<string, number>;
    followsGained = fv.follow ?? 0;
    followsLost = fv.unfollow ?? 0;
    followersDelta = followsGained - followsLost;
    hasFollowData = true;
  } else if (followerSeries) {
    // Fallback: calculate from time series first/last
    followersDelta = followerSeries.last - followerSeries.first;
    hasFollowData = followerSeries.last > 0; // only show if data is valid
  }

  const totalReach = sumInsightValues(insights, "reach");
  const totalImpressions = sumInsightValues(insights, "impressions");
  const profileViews = sumInsightValues(insights, "profile_views");

  // accounts_engaged (total_value)
  const engagedEntry = insights?.find((e) => e.name === "accounts_engaged");
  let totalEngaged = 0;
  if (engagedEntry?.values?.[0]?.value) {
    const v = engagedEntry.values[0].value;
    if (typeof v === "number") totalEngaged = v;
    else if (typeof v === "object" && v !== null) totalEngaged = Object.values(v as Record<string, number>).reduce((s, n) => s + n, 0);
  }

  // total_interactions (total_value)
  const interactionsEntry = insights?.find((e) => e.name === "total_interactions");
  let totalInteractions = 0;
  if (interactionsEntry?.values?.[0]?.value) {
    const v = interactionsEntry.values[0].value;
    if (typeof v === "number") totalInteractions = v;
    else if (typeof v === "object" && v !== null) totalInteractions = Object.values(v as Record<string, number>).reduce((s, n) => s + n, 0);
  }

  const interactions = totalInteractions || totalEngaged;
  const engagementRate = totalReach > 0 ? (interactions / totalReach) * 100 : 0;

  const cards = [
    { icon: Users, label: "Seguidores", value: fmtNumber(followers), gradient: "from-blue-500/10 to-blue-600/5", border: "border-blue-500/20", show: true },
    { icon: followersDelta >= 0 ? UserPlus : UserMinus, label: "Saldo Seguidores", value: `${followersDelta >= 0 ? "+" : ""}${fmtNumber(followersDelta)}`, sub: followsGained > 0 ? `+${fmtNumber(followsGained)} / -${fmtNumber(followsLost)}` : undefined, gradient: followersDelta >= 0 ? "from-emerald-500/10 to-emerald-600/5" : "from-red-500/10 to-red-600/5", border: followersDelta >= 0 ? "border-emerald-500/20" : "border-red-500/20", show: hasFollowData },
    { icon: Eye, label: "Alcance", value: fmtNumber(totalReach), gradient: "from-cyan-500/10 to-cyan-600/5", border: "border-cyan-500/20", show: totalReach > 0 },
    { icon: Heart, label: "Interacoes", value: fmtNumber(interactions), gradient: "from-pink-500/10 to-pink-600/5", border: "border-pink-500/20", show: interactions > 0 },
    { icon: TrendingUp, label: "Engajamento", value: fmtPercent(engagementRate), gradient: "from-amber-500/10 to-amber-600/5", border: "border-amber-500/20", show: engagementRate > 0 },
    { icon: MousePointerClick, label: "Visitas Perfil", value: fmtNumber(profileViews), gradient: "from-orange-500/10 to-orange-600/5", border: "border-orange-500/20", show: profileViews > 0 },
    { icon: Eye, label: "Impressoes", value: fmtNumber(totalImpressions), gradient: "from-purple-500/10 to-purple-600/5", border: "border-purple-500/20", show: totalImpressions > 0 },
  ].filter((c) => c.show);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, minmax(0, 1fr))` }}>
      {cards.map((c) => (
        <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} sub={c.sub} gradient={c.gradient} border={c.border} />
      ))}
    </div>
  );
}
