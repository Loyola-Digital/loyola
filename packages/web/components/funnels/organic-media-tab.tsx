"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Youtube,
  Instagram,
  ExternalLink,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useStageOrganicPosts,
  useUnlinkOrganicPost,
} from "@/lib/hooks/use-organic-posts";
import type {
  StageOrganicPostHydrated,
  OrganicPostSource,
  YouTubeOrganicMetrics,
  InstagramOrganicMetrics,
} from "@loyola-x/shared";
import { useQueryClient } from "@tanstack/react-query";

interface OrganicMediaTabProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

type Filter = "all" | "youtube" | "instagram";

function fmtNumber(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("pt-BR");
}

export function OrganicMediaTab({
  projectId,
  funnelId,
  stageId,
}: OrganicMediaTabProps) {
  const { data, isLoading, refetch, isFetching } = useStageOrganicPosts(
    projectId,
    funnelId,
    stageId,
  );
  const unlinkMutation = useUnlinkOrganicPost(projectId);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmUnlink, setConfirmUnlink] = useState<StageOrganicPostHydrated | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter((p) => p.source === filter);
  }, [data, filter]);

  async function handleUnlink(post: StageOrganicPostHydrated) {
    try {
      await unlinkMutation.mutateAsync({
        funnelId,
        stageId,
        linkId: post.id,
        source: post.source,
      });
      toast.success("Post desvinculado");
      setConfirmUnlink(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desvincular");
    }
  }

  function handleRefetch() {
    qc.invalidateQueries({
      queryKey: ["stage-organic-posts", projectId, funnelId, stageId],
    });
    refetch();
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Nenhuma mídia orgânica vinculada a esta etapa</p>
          <p className="text-sm text-muted-foreground">
            Vá para o Dashboard de Orgânico e use o botão{" "}
            <span className="font-mono text-xs">Vincular</span> nos posts para
            marcar quais sustentam esta etapa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/youtube-organic`}>
              <Youtube className="h-4 w-4 text-red-500" />
              Vídeos do YouTube
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/instagram`}>
              <Instagram className="h-4 w-4 text-pink-500" />
              Posts do Instagram
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const ytCount = data.filter((p) => p.source === "youtube").length;
  const igCount = data.filter((p) => p.source === "instagram").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            Todos ({data.length})
          </FilterButton>
          <FilterButton active={filter === "youtube"} onClick={() => setFilter("youtube")}>
            <Youtube className="h-3.5 w-3.5 text-red-500" />
            YouTube ({ytCount})
          </FilterButton>
          <FilterButton active={filter === "instagram"} onClick={() => setFilter("instagram")}>
            <Instagram className="h-3.5 w-3.5 text-pink-500" />
            Instagram ({igCount})
          </FilterButton>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefetch} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((post) => (
          <OrganicCard
            key={post.id}
            post={post}
            onUnlink={() => setConfirmUnlink(post)}
          />
        ))}
      </div>

      <AlertDialog
        open={!!confirmUnlink}
        onOpenChange={(o) => { if (!o) setConfirmUnlink(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular post?</AlertDialogTitle>
            <AlertDialogDescription>
              O post sai desta aba mas continua existindo no Dashboard de
              Orgânico. Você pode vinculá-lo de novo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmUnlink && handleUnlink(confirmUnlink)}
              disabled={unlinkMutation.isPending}
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// CARD
// ============================================================

interface OrganicCardProps {
  post: StageOrganicPostHydrated;
  onUnlink: () => void;
}

function OrganicCard({ post, onUnlink }: OrganicCardProps) {
  const isYouTube = post.source === "youtube";
  const SourceIcon = isYouTube ? Youtube : Instagram;
  const sourceColor = isYouTube ? "text-red-500" : "text-pink-500";

  if (!post.hydration) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 bg-muted/10 p-4 space-y-2 opacity-70">
        <div className="flex items-center gap-2">
          <SourceIcon className={`h-4 w-4 ${sourceColor}`} />
          <p className="text-xs font-medium">
            {isYouTube ? "Vídeo do YouTube" : "Post do Instagram"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Não foi possível carregar dados — tente recarregar.</span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono break-all">
          ID: {post.externalId}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onUnlink}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Desvincular
        </Button>
      </div>
    );
  }

  const { hydration } = post;
  const isStale = hydration.isStale;

  return (
    <div
      className={`group relative rounded-lg border border-border/30 bg-card/60 overflow-hidden hover:border-border/60 transition-all ${isStale ? "opacity-60" : ""}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted">
        {hydration.thumbnailUrl ? (
          <img
            src={hydration.thumbnailUrl}
            alt={hydration.title ?? ""}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <SourceIcon className={`h-10 w-10 ${sourceColor} opacity-30`} />
          </div>
        )}
        <span className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium ${sourceColor}`}>
          <SourceIcon className="h-3 w-3" />
          {isYouTube ? "YouTube" : "Instagram"}
        </span>
        {isStale && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <span className="rounded-md bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-white">
              Post indisponível na fonte
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-medium line-clamp-2 min-h-[2rem]">
          {hydration.title ?? <span className="text-muted-foreground italic">Sem título</span>}
        </p>

        {/* Metrics */}
        {isYouTube ? (
          <YouTubeMetricsLine metrics={hydration.metrics as YouTubeOrganicMetrics} />
        ) : (
          <InstagramMetricsLine metrics={hydration.metrics as InstagramOrganicMetrics} />
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-1 border-t border-border/20 p-2">
        <Button asChild variant="ghost" size="sm" className="text-[11px] h-7 gap-1">
          <a
            href={hydration.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] h-7 gap-1 text-muted-foreground hover:text-destructive"
          onClick={onUnlink}
        >
          <Trash2 className="h-3 w-3" />
          Desvincular
        </Button>
      </div>
    </div>
  );
}

function YouTubeMetricsLine({ metrics }: { metrics: YouTubeOrganicMetrics }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
      <span>👁 {fmtNumber(metrics.viewCount)}</span>
      <span>👍 {fmtNumber(metrics.likeCount)}</span>
      <span>💬 {fmtNumber(metrics.commentCount)}</span>
      {metrics.watchTimeMinutes != null && <span>⏱ {fmtNumber(metrics.watchTimeMinutes)}min</span>}
      {metrics.avgRetention != null && <span>📊 {metrics.avgRetention.toFixed(1)}%</span>}
    </div>
  );
}

function InstagramMetricsLine({ metrics }: { metrics: InstagramOrganicMetrics }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span title="Reach (alcance único)">👁 {fmtNumber(metrics.reach)}</span>
        <span title="Curtidas">❤ {fmtNumber(metrics.likeCount)}</span>
        <span title="Comentários">💬 {fmtNumber(metrics.commentCount)}</span>
        <span title="Saves">🔖 {fmtNumber(metrics.saved)}</span>
      </div>
      <div
        className={`text-[10px] font-medium ${instagramEngagementColor(metrics.engagementRate)}`}
        title={buildInstagramEngagementTooltip(metrics)}
      >
        ⚡ Engajamento: {fmtEngagement(metrics.engagementRate)}
      </div>
    </div>
  );
}

function fmtEngagement(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${rate.toFixed(2)}%`;
}

function instagramEngagementColor(rate: number | null | undefined): string {
  if (rate == null) return "text-muted-foreground";
  if (rate >= 10) return "text-green-600";
  if (rate >= 5) return "text-blue-500";
  if (rate >= 2) return "text-amber-500";
  return "text-muted-foreground";
}

function buildInstagramEngagementTooltip(m: InstagramOrganicMetrics): string {
  if (m.reach == null || m.reach <= 0) {
    return "Reach indisponível para este post — engajamento não pode ser calculado.";
  }
  const likes = m.likeCount ?? 0;
  const comments = m.commentCount ?? 0;
  const saved = m.saved ?? 0;
  const numerator = likes + comments + saved;
  const rate = m.engagementRate ?? (numerator / m.reach) * 100;
  const fmtN = (n: number) => n.toLocaleString("pt-BR");
  return [
    "Engajamento = (likes + comments + saves) / reach × 100",
    `= (${fmtN(likes)} + ${fmtN(comments)} + ${fmtN(saved)}) / ${fmtN(m.reach)} × 100`,
    `= ${fmtN(numerator)} / ${fmtN(m.reach)} × 100`,
    `= ${rate.toFixed(2)}%`,
  ].join("\n");
}

// ============================================================
// FILTER BUTTON
// ============================================================

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

// helper export to silence unused import warning if any
export type { OrganicPostSource };
