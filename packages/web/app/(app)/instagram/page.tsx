"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Instagram, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useInstagramAccounts } from "@/lib/hooks/use-instagram-accounts";
import {
  useInstagramProfile,
  useInstagramInsights,
  useInstagramMedia,
  useInstagramDemographics,
  useInstagramStories,
  useInstagramReels,
  useRefreshInstagram,
} from "@/lib/hooks/use-instagram";
import { AccountSelector } from "@/components/instagram/account-selector";
import {
  PeriodSelector,
  periodToConfig,
  type PeriodConfig,
} from "@/components/instagram/period-selector";
import { OverviewCards } from "@/components/instagram/overview-cards";
import { ReachChart } from "@/components/instagram/reach-chart";
import { PostsTable } from "@/components/instagram/posts-table";
import { StoriesSection } from "@/components/instagram/stories-section";
import { ReelsSection } from "@/components/instagram/reels-section";
import { AudienceCharts } from "@/components/instagram/audience-charts";

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Instagram className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-lg">Nenhuma conta conectada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Adicione uma conta do Instagram para visualizar as métricas.
        </p>
      </div>
      <Button asChild>
        <Link href="/settings/instagram">
          <Settings className="h-4 w-4" />
          Ir para Configurações
        </Link>
      </Button>
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================

export default function InstagramDashboardPage() {
  const { data: accounts, isLoading: accountsLoading } = useInstagramAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodConfig>(periodToConfig("30d"));

  // Auto-select first account
  useEffect(() => {
    if (!selectedAccountId && accounts && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const { data: profile, isLoading: profileLoading } = useInstagramProfile(selectedAccountId);
  const { data: insights, isLoading: insightsLoading } = useInstagramInsights(
    selectedAccountId,
    period.period === "custom" ? "day" : "day",
    period.since,
    period.until,
  );
  const { data: media, isLoading: mediaLoading } = useInstagramMedia(selectedAccountId, 25);
  const { data: demographics, isLoading: demographicsLoading } = useInstagramDemographics(selectedAccountId);
  const { data: stories, isLoading: storiesLoading } = useInstagramStories(selectedAccountId);
  const { data: reels, isLoading: reelsLoading } = useInstagramReels(selectedAccountId);
  const refresh = useRefreshInstagram(selectedAccountId);

  function handleRefreshAll() {
    if (!selectedAccountId) return;
    refresh.mutate(undefined, {
      onSuccess: () => toast.success("Cache atualizado!"),
      onError: () => toast.error("Erro ao atualizar cache."),
    });
  }

  // Show empty state when loaded and no accounts
  if (!accountsLoading && (!accounts || accounts.length === 0)) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Instagram</h1>
          <AccountSelector value={selectedAccountId} onChange={setSelectedAccountId} />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={!selectedAccountId || refresh.isPending}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Overview KPI cards */}
      <OverviewCards
        profile={profile}
        insights={insights?.data}
        isLoading={profileLoading || insightsLoading}
      />

      {/* Reach & Impressions chart */}
      <ReachChart
        data={insights?.data}
        isLoading={insightsLoading}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
      />

      {/* Posts table */}
      <PostsTable
        data={media?.data}
        isLoading={mediaLoading}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
      />

      {/* Stories + Reels side by side on large screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        <StoriesSection
          data={stories}
          isLoading={storiesLoading}
          onRefresh={handleRefreshAll}
          isRefreshing={refresh.isPending}
        />
        <ReelsSection
          data={reels}
          isLoading={reelsLoading}
          onRefresh={handleRefreshAll}
          isRefreshing={refresh.isPending}
        />
      </div>

      {/* Audience demographics */}
      <AudienceCharts
        data={demographics}
        isLoading={demographicsLoading}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
      />
    </div>
  );
}
