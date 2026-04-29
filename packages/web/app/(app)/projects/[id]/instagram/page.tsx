"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { Instagram, RefreshCw, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useInstagramAccounts } from "@/lib/hooks/use-instagram-accounts";
import { useProjects } from "@/lib/hooks/use-projects";
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

interface Props {
  params: Promise<{ id: string }>;
}

function ProjectEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Instagram className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-lg">Nenhuma conta vinculada a esta empresa</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Adicione uma conta do Instagram em Settings e vincule à empresa.
        </p>
      </div>
      <Button asChild>
        <Link href="/settings/instagram">
          <Settings className="h-4 w-4" />
          Ir para Settings
        </Link>
      </Button>
    </div>
  );
}

export default function ProjectInstagramPage({ params }: Props) {
  const { id: projectId } = use(params);

  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);

  const { data: accounts, isLoading: accountsLoading } = useInstagramAccounts(projectId);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodConfig>(periodToConfig("30d"));

  // Auto-select: when project has accounts, pick first (or only) one
  useEffect(() => {
    if (!selectedAccountId && accounts && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const { data: profile, isLoading: profileLoading } = useInstagramProfile(selectedAccountId);
  const { data: insights, isLoading: insightsLoading, error: insightsError } = useInstagramInsights(
    selectedAccountId,
    "day",
    period.since,
    period.until,
  );
  // Período anterior (mesma duração, shift pra trás) — para card "Variação de Ganhos"
  const previousPeriodWindow = {
    since: period.since - (period.until - period.since),
    until: period.since,
  };
  const { data: previousInsights } = useInstagramInsights(
    selectedAccountId,
    "day",
    previousPeriodWindow.since,
    previousPeriodWindow.until,
  );
  const { data: media, isLoading: mediaLoading } = useInstagramMedia(selectedAccountId, 100);
  // Posts publicados dentro do período do PeriodSelector
  const postsInPeriod = media?.data
    ? media.data.filter((p) => {
        const ts = Math.floor(new Date(p.timestamp).getTime() / 1000);
        return ts >= period.since && ts <= period.until;
      }).length
    : null;
  // Truncado se atingiu o limite (100) E o post mais antigo ainda está dentro do período
  const postsCountTruncated = !!(
    media?.data &&
    media.data.length >= 100 &&
    (() => {
      const oldest = media.data[media.data.length - 1];
      const oldestTs = Math.floor(new Date(oldest.timestamp).getTime() / 1000);
      return oldestTs >= period.since;
    })()
  );
  const { data: demographics, isLoading: demographicsLoading, error: demographicsError } = useInstagramDemographics(selectedAccountId);
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

  // Empty state when loaded and no accounts for this project
  if (!accountsLoading && (!accounts || accounts.length === 0)) {
    return (
      <div className="space-y-4">
        <Breadcrumb projectId={projectId} projectName={project?.clientName ?? project?.name} />
        <ProjectEmptyState />
      </div>
    );
  }

  const showSelector = accounts && accounts.length > 1;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb projectId={projectId} projectName={project?.clientName ?? project?.name} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Instagram</h1>
          {showSelector && (
            <AccountSelector
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              projectId={projectId}
            />
          )}
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/instagram">
              <Settings className="h-3.5 w-3.5" />
              Gerenciar contas
            </Link>
          </Button>
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
      </div>

      {/* Overview KPI cards */}
      <OverviewCards
        profile={profile}
        insights={insights?.data}
        isLoading={profileLoading || insightsLoading}
        period={{ since: period.since, until: period.until }}
        previousInsights={previousInsights?.data}
        previousPeriod={previousPeriodWindow}
        postsInPeriod={postsInPeriod}
        postsCountTruncated={postsCountTruncated}
      />

      {/* Reach & Impressions chart */}
      <ReachChart
        data={insights?.data}
        isLoading={insightsLoading}
        error={insightsError as Error | null}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
      />

      {/* Posts table */}
      <PostsTable
        data={media?.data}
        isLoading={mediaLoading}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
        projectId={projectId}
      />

      {/* Stories + Reels */}
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
        error={demographicsError as Error | null}
        onRefresh={handleRefreshAll}
        isRefreshing={refresh.isPending}
      />
    </div>
  );
}

function Breadcrumb({ projectId, projectName }: { projectId: string; projectName?: string }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/projects" className="hover:text-foreground transition-colors">
        Empresas
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <Link href={`/projects/${projectId}`} className="hover:text-foreground transition-colors">
        {projectName ?? "Empresa"}
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">Instagram</span>
    </nav>
  );
}
