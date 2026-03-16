"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, ImageIcon, TrendingUp } from "lucide-react";
import type { InstagramProfile, InsightEntry } from "@/lib/hooks/use-instagram";

interface OverviewCardsProps {
  profile?: InstagramProfile;
  insights?: InsightEntry[];
  isLoading: boolean;
}

function calcEngagementRate(profile?: InstagramProfile, insights?: InsightEntry[]): number | null {
  if (!profile || !insights) return null;
  const reachEntry = insights.find((e) => e.name === "reach");
  if (!reachEntry || reachEntry.values.length === 0) return null;
  const totalReach = reachEntry.values.reduce((sum, v) => sum + (typeof v.value === "number" ? v.value : 0), 0);
  if (totalReach === 0) return null;
  return Math.round((profile.followers_count / totalReach) * 100 * 10) / 10;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change?: number | null;
}

function KpiCard({ icon, label, value, change }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</span>
          {change !== undefined && change !== null && (
            <Badge variant={change >= 0 ? "default" : "destructive"} className="text-xs mb-0.5">
              {change >= 0 ? "+" : ""}{change}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewCards({ profile, insights, isLoading }: OverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const engagementRate = calcEngagementRate(profile, insights);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        icon={<Users className="h-4 w-4" />}
        label="Seguidores"
        value={profile?.followers_count ?? 0}
      />
      <KpiCard
        icon={<UserPlus className="h-4 w-4" />}
        label="Seguindo"
        value={profile?.follows_count ?? 0}
      />
      <KpiCard
        icon={<ImageIcon className="h-4 w-4" />}
        label="Posts"
        value={profile?.media_count ?? 0}
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Eng. Rate"
        value={engagementRate !== null ? `${engagementRate}%` : "—"}
      />
    </div>
  );
}
