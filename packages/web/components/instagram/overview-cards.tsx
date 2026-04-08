"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, Eye, MousePointerClick,
  TrendingUp, Heart, Link2,
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
  const followerSeries = getFollowerTimeSeries(insights);
  const followersInitial = followerSeries?.first ?? followers;
  const followersFinal = followerSeries?.last ?? followers;
  const followersDelta = followersFinal - followersInitial;

  const totalReach = sumInsightValues(insights, "reach");
  const totalImpressions = sumInsightValues(insights, "impressions") || sumInsightValues(insights, "views");
  const websiteClicks = sumInsightValues(insights, "website_clicks");
  const profileViews = sumInsightValues(insights, "profile_views");

  // Engagement rate = accounts_engaged / reach (or interactions / reach)
  const engagedEntry = insights?.find((e) => e.name === "accounts_engaged");
  let totalEngaged = 0;
  if (engagedEntry) {
    if (Array.isArray(engagedEntry.values) && engagedEntry.values.length > 0) {
      const v = engagedEntry.values[0].value;
      if (typeof v === "number") totalEngaged = v;
      else if (typeof v === "object" && v !== null) {
        totalEngaged = Object.values(v as Record<string, number>).reduce((s, n) => s + n, 0);
      }
    }
  }

  const engagementRate = totalReach > 0 ? (totalEngaged / totalReach) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Main KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard
          icon={Users}
          label="Seguidores"
          value={fmtNumber(followers)}
          gradient="from-blue-500/10 to-blue-600/5"
          border="border-blue-500/20"
        />
        <KpiCard
          icon={followersDelta >= 0 ? UserPlus : UserMinus}
          label="Saldo"
          value={`${followersDelta >= 0 ? "+" : ""}${fmtNumber(followersDelta)}`}
          sub={`${fmtNumber(followersInitial)} → ${fmtNumber(followersFinal)}`}
          gradient={followersDelta >= 0 ? "from-emerald-500/10 to-emerald-600/5" : "from-red-500/10 to-red-600/5"}
          border={followersDelta >= 0 ? "border-emerald-500/20" : "border-red-500/20"}
        />
        <KpiCard
          icon={Eye}
          label="Alcance"
          value={fmtNumber(totalReach)}
          gradient="from-cyan-500/10 to-cyan-600/5"
          border="border-cyan-500/20"
        />
        <KpiCard
          icon={Eye}
          label="Impressoes"
          value={fmtNumber(totalImpressions)}
          gradient="from-purple-500/10 to-purple-600/5"
          border="border-purple-500/20"
        />
        <KpiCard
          icon={Heart}
          label="Interacoes"
          value={fmtNumber(totalEngaged)}
          gradient="from-pink-500/10 to-pink-600/5"
          border="border-pink-500/20"
        />
        <KpiCard
          icon={TrendingUp}
          label="Engajamento"
          value={fmtPercent(engagementRate)}
          gradient="from-amber-500/10 to-amber-600/5"
          border="border-amber-500/20"
        />
        <KpiCard
          icon={Link2}
          label="Cliques Bio"
          value={fmtNumber(websiteClicks)}
          gradient="from-indigo-500/10 to-indigo-600/5"
          border="border-indigo-500/20"
        />
        <KpiCard
          icon={MousePointerClick}
          label="Visitas Perfil"
          value={fmtNumber(profileViews)}
          gradient="from-orange-500/10 to-orange-600/5"
          border="border-orange-500/20"
        />
      </div>
    </div>
  );
}
