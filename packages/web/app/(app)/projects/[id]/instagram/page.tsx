"use client";

/**
 * A tela de Instagram da empresa, em abas.
 *
 * Era uma coluna só com doze blocos: quem abria para saber se o mês foi bom
 * rolava por tabelas de post, e quem abria para escolher o próximo conteúdo
 * passava pelos gráficos de audiência. Cada aba agora responde uma pergunta —
 * como vamos, o que publicamos, quem nos segue, o que mandar para o cliente e
 * o que decidir.
 */

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { Instagram, RefreshCw, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmUmaFrase } from "@/components/instagram/em-uma-frase";
import { PostsQueExplicam } from "@/components/instagram/posts-que-explicam";
import { Glossario } from "@/components/instagram/glossario";
import { QuemEntraEQuemSai } from "@/components/instagram/quem-entra-e-quem-sai";
import { DeOndeVemODado } from "@/components/instagram/de-onde-vem-o-dado";
import { PainelDeDecisoes } from "@/components/instagram/painel-de-decisoes";
import { RelatorioDoMes } from "@/components/instagram/relatorio-do-mes";
import { DoAlcanceAoLead } from "@/components/instagram/do-alcance-ao-lead";
import { LeiturasQuePedemDecisao } from "@/components/instagram/leituras-que-pedem-decisao";
import { GraficoDoPerfil } from "@/components/instagram/grafico-do-perfil";
import { PostsTable } from "@/components/instagram/posts-table";
import { PerformancePorFormato } from "@/components/instagram/performance-por-formato";
import { PorTema } from "@/components/instagram/por-tema";
import { PorChamada } from "@/components/instagram/por-chamada";
import { AnaliseComIaDoPeriodo } from "@/components/instagram/analise-com-ia";
import { StoriesSection } from "@/components/instagram/stories-section";
import { ReelsSection } from "@/components/instagram/reels-section";
import { AudienceCharts } from "@/components/instagram/audience-charts";
import { TopPostsByFollowersCard } from "@/components/instagram/top-posts-by-followers-card";
import { TabelaMensal } from "@/components/instagram/tabela-mensal";
import { ComparativoDeMeses } from "@/components/instagram/comparativo-de-meses";
import { GenerateReportDialog } from "@/components/instagram/generate-report-dialog";
import { FileText } from "lucide-react";

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
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

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
  // Período anterior (mesma duração, shift pra trás) — para as setas de variação
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
  const postsDoPeriodo = media?.data?.filter((p) => {
    const ts = Math.floor(new Date(p.timestamp).getTime() / 1000);
    return ts >= period.since && ts <= period.until;
  });
  const postsInPeriod = postsDoPeriodo?.length ?? null;
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

      <Tabs defaultValue="visao-geral">
        <TabsList className="max-w-full justify-start overflow-x-auto h-auto">
          <TabsTrigger value="visao-geral" className="shrink-0">Visão geral</TabsTrigger>
          <TabsTrigger value="posts" className="shrink-0">Posts</TabsTrigger>
          <TabsTrigger value="seguidores" className="shrink-0">Seguidores e audiência</TabsTrigger>
          <TabsTrigger value="relatorios" className="shrink-0">Relatório do mês</TabsTrigger>
          <TabsTrigger value="decisoes" className="shrink-0">Decisões</TabsTrigger>
        </TabsList>

        {/* ---------- Como vamos ---------- */}
        <TabsContent value="visao-geral" className="mt-6 space-y-6">
          <EmUmaFrase
            insights={insights?.data}
            previousInsights={previousInsights?.data}
            isLoading={insightsLoading}
          />

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

          <GraficoDoPerfil
            data={insights?.data}
            dataAnterior={previousInsights?.data}
            isLoading={insightsLoading}
            error={insightsError as Error | null}
            onRefresh={handleRefreshAll}
            isRefreshing={refresh.isPending}
            posts={media?.data}
            accountId={selectedAccountId}
          />

          <PostsQueExplicam posts={postsDoPeriodo} isLoading={mediaLoading} />

          <DoAlcanceAoLead insights={insights?.data} isLoading={insightsLoading} />

          {/* A leitura interpretativa vem depois dos números que ela lê. */}
          <AnaliseComIaDoPeriodo
            accountId={selectedAccountId}
            since={period.since}
            until={period.until}
            media={media?.data}
          />

          <Glossario />
        </TabsContent>

        {/* ---------- O que publicamos ---------- */}
        <TabsContent value="posts" className="mt-6 space-y-6">
          <PerformancePorFormato
            data={media?.data}
            isLoading={mediaLoading}
            since={period.since}
            until={period.until}
          />

          <PostsTable
            data={media?.data}
            isLoading={mediaLoading}
            onRefresh={handleRefreshAll}
            isRefreshing={refresh.isPending}
            projectId={projectId}
            since={period.since}
            until={period.until}
            accountId={selectedAccountId}
          />

          <PorTema
            data={media?.data}
            isLoading={mediaLoading}
            since={period.since}
            until={period.until}
            accountId={selectedAccountId}
          />

          <TopPostsByFollowersCard
            accountId={selectedAccountId}
            days={Math.max(1, Math.round((period.until - period.since) / 86400))}
          />

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
        </TabsContent>

        {/* ---------- Quem nos segue ---------- */}
        <TabsContent value="seguidores" className="mt-6 space-y-6">
          <TabelaMensal accountId={selectedAccountId} />
          <ComparativoDeMeses accountId={selectedAccountId} />
          <QuemEntraEQuemSai accountId={selectedAccountId} />
          <AudienceCharts
            data={demographics}
            isLoading={demographicsLoading}
            error={demographicsError as Error | null}
            onRefresh={handleRefreshAll}
            isRefreshing={refresh.isPending}
          />
        </TabsContent>

        {/* ---------- O que mandar para o cliente ---------- */}
        <TabsContent value="relatorios" className="mt-6 space-y-5">
          <RelatorioDoMes
            accountId={selectedAccountId}
            profile={profile}
            media={media?.data}
            isLoading={mediaLoading}
          />

          {/* O relatório SALVO, que já existia: congela o mês com data e autor.
              A tela acima é o mês ao vivo, e muda quando o dado muda. */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Relatório salvo</h3>
              <p className="text-xs text-muted-foreground">
                Congela o mês com data e autor — é o que fica no histórico da empresa.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setReportDialogOpen(true)} className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Gerar relatório
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectId}/reports/instagram`}>
                  <FileText className="h-3.5 w-3.5" />
                  Ver histórico
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---------- O que decidir ---------- */}
        <TabsContent value="decisoes" className="mt-6 space-y-6">
          <LeiturasQuePedemDecisao
            insights={insights?.data}
            previousInsights={previousInsights?.data}
            posts={postsDoPeriodo}
            isLoading={insightsLoading || mediaLoading}
          />

          {/* A chamada é uma linha de legenda, lida por regra: nasce
              preenchida e é a parte mais barata de trocar. */}
          <PorChamada
            data={media?.data}
            isLoading={mediaLoading}
            since={period.since}
            until={period.until}
          />

          <PainelDeDecisoes
            accountId={selectedAccountId}
            media={media?.data}
            isLoading={mediaLoading}
          />
          <DeOndeVemODado />
        </TabsContent>
      </Tabs>

      <GenerateReportDialog projectId={projectId} open={reportDialogOpen} onOpenChange={setReportDialogOpen} />
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
