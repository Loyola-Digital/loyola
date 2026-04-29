"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, ArrowUpDown, Link2, UserPlus } from "lucide-react";
import type { InstagramMedia, InsightEntry } from "@/lib/hooks/use-instagram";
import { format, parseISO } from "date-fns";
import { useOrganicPostLinks } from "@/lib/hooks/use-organic-posts";
import { LinkPostToStageModal } from "@/components/funnels/link-post-to-stage-modal";

type SortKey = "timestamp" | "like_count" | "comments_count" | "engagement_rate" | "follows";

interface PostsTableProps {
  data?: InstagramMedia[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  projectId?: string;
  /** Insights account-level para fallback estimado de follows quando o post é Reel/Video. */
  accountInsights?: InsightEntry[];
  /** Janela do PeriodSelector — usado para normalizar a estimativa. */
  period?: { since: number; until: number };
}

interface FollowEstimateContext {
  /** Net follows total do período (gained - lost). Null se indisponível. */
  netFollows: number | null;
  /** Soma de reach dos posts in-period (denominador da estimativa). */
  totalReachInPeriod: number;
}

/**
 * Lê follows_and_unfollows com breakdown=follow_type (v25+) ou formatos legados,
 * retornando net = gained - lost. Idêntico ao helper no overview-cards mas isolado
 * pra evitar import cruzado.
 */
function computeNetFollows(insights: InsightEntry[] | undefined): number | null {
  if (!insights) return null;
  const entry = insights.find((e) => e.name === "follows_and_unfollows");
  if (!entry) return null;

  const breakdowns = entry.total_value?.breakdowns as
    | Array<{ results?: Array<{ dimension_values?: string[]; value?: number }> }>
    | undefined;
  if (breakdowns && breakdowns.length > 0) {
    let gained = 0;
    let lost = 0;
    for (const r of breakdowns[0]?.results ?? []) {
      const dim = r.dimension_values?.[0];
      const val = typeof r.value === "number" ? r.value : 0;
      if (dim === "FOLLOWER") gained = val;
      else if (dim === "NON_FOLLOWER") lost = val;
    }
    return gained - lost;
  }
  const tv = entry.total_value?.value;
  if (tv && typeof tv === "object") {
    const fv = tv as Record<string, number>;
    return (fv.follow ?? 0) - (fv.unfollow ?? 0);
  }
  if (entry.values?.[0]?.value && typeof entry.values[0].value === "object") {
    const fv = entry.values[0].value as Record<string, number>;
    return (fv.follow ?? 0) - (fv.unfollow ?? 0);
  }
  return null;
}

export function PostsTable({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  projectId,
  accountInsights,
  period,
}: PostsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortAsc, setSortAsc] = useState(false);
  const [linkModal, setLinkModal] = useState<{ mediaId: string; title: string } | null>(null);

  // Contexto pra fallback estimado de follows (Reels/Video não expõem per-post na Graph API)
  const followsCtx: FollowEstimateContext = (() => {
    const netFollows = computeNetFollows(accountInsights);
    let totalReachInPeriod = 0;
    if (data && period) {
      for (const p of data) {
        const ts = Math.floor(new Date(p.timestamp).getTime() / 1000);
        if (ts >= period.since && ts <= period.until && (p.reach ?? 0) > 0) {
          totalReachInPeriod += p.reach ?? 0;
        }
      }
    }
    return { netFollows, totalReachInPeriod };
  })();

  function getDisplayFollows(post: InstagramMedia): {
    value: number | null;
    estimated: boolean;
  } {
    if (post.follows != null) return { value: post.follows, estimated: false };
    if (
      followsCtx.netFollows == null ||
      followsCtx.totalReachInPeriod <= 0 ||
      !period ||
      !post.reach ||
      post.reach <= 0
    ) {
      return { value: null, estimated: false };
    }
    const ts = Math.floor(new Date(post.timestamp).getTime() / 1000);
    if (ts < period.since || ts > period.until) return { value: null, estimated: false };
    const share = post.reach / followsCtx.totalReachInPeriod;
    const estimated = Math.round(share * followsCtx.netFollows);
    return { value: estimated, estimated: true };
  }

  const { data: linksMap } = useOrganicPostLinks(projectId ?? null, "instagram");
  const linkedCountByMediaId = new Map<string, number>();
  for (const entry of linksMap ?? []) {
    linkedCountByMediaId.set(entry.externalId, entry.stageIds.length);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    let diff = 0;
    if (sortKey === "timestamp") {
      diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else if (sortKey === "engagement_rate") {
      diff = (a.engagement_rate ?? -1) - (b.engagement_rate ?? -1);
    } else if (sortKey === "follows") {
      const av = getDisplayFollows(a).value ?? -1;
      const bv = getDisplayFollows(b).value ?? -1;
      diff = av - bv;
    } else {
      diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    }
    return sortAsc ? diff : -diff;
  });

  function fmtFollows(v: number | null | undefined, estimated: boolean): string {
    if (v == null) return "—";
    const formatted = v > 0 ? `+${v.toLocaleString("pt-BR")}` : v.toLocaleString("pt-BR");
    return estimated ? `~${formatted}` : formatted;
  }

  function followsColor(v: number | null | undefined): string {
    if (v == null) return "text-muted-foreground";
    if (v >= 50) return "text-emerald-600 font-medium";
    if (v >= 10) return "text-emerald-500";
    if (v > 0) return "text-foreground";
    return "text-muted-foreground";
  }

  function buildFollowsTooltip(
    post: InstagramMedia,
    display: { value: number | null; estimated: boolean },
  ): string {
    if (display.value == null) {
      return "Métrica indisponível — sem dado real (Graph API não expõe para Reels) e sem dados de follows do período para estimar.";
    }
    if (!display.estimated) {
      return `${display.value} novo(s) seguidor(es) via este post (dado real da Graph API)`;
    }
    // Estimativa
    const reach = post.reach ?? 0;
    const pct = followsCtx.totalReachInPeriod > 0
      ? ((reach / followsCtx.totalReachInPeriod) * 100).toFixed(1)
      : "0";
    return [
      "Estimativa proporcional ao alcance:",
      `Net follows do período: ${followsCtx.netFollows ?? 0}`,
      `Alcance deste post: ${reach.toLocaleString("pt-BR")} (${pct}% do período)`,
      `Estimado: ~${display.value} seguidor(es)`,
      "",
      "Graph API não expõe follows per-Reel; a estimativa atribui novos seguidores proporcionalmente ao alcance.",
    ].join("\n");
  }

  function fmtEngagement(rate: number | null | undefined): string {
    if (rate == null) return "—";
    return `${rate.toFixed(2)}%`;
  }

  function engagementColor(rate: number | null | undefined): string {
    if (rate == null) return "text-muted-foreground";
    if (rate >= 10) return "text-green-600 font-medium";
    if (rate >= 5) return "text-blue-600";
    if (rate >= 2) return "text-amber-600";
    return "text-muted-foreground";
  }

  function buildEngagementTooltip(post: InstagramMedia): string {
    if (post.reach == null || post.reach <= 0) {
      return "Reach indisponível para este post — engajamento não pode ser calculado.";
    }
    const likes = post.like_count ?? 0;
    const comments = post.comments_count ?? 0;
    const saved = post.saved ?? 0;
    const numerator = likes + comments + saved;
    const rate = post.engagement_rate ?? (numerator / post.reach) * 100;
    const fmtN = (n: number) => n.toLocaleString("pt-BR");
    return [
      "Engajamento = (likes + comments + saves) / reach × 100",
      `= (${fmtN(likes)} + ${fmtN(comments)} + ${fmtN(saved)}) / ${fmtN(post.reach)} × 100`,
      `= ${fmtN(numerator)} / ${fmtN(post.reach)} × 100`,
      `= ${rate.toFixed(2)}%`,
    ].join("\n");
  }

  const showLinkColumn = !!projectId;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Posts Recentes</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum post encontrado</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Mídia</TableHead>
                  <TableHead>Legenda</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("like_count")}>
                      Curtidas <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("comments_count")}>
                      Comentários <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 gap-1"
                      onClick={() => toggleSort("engagement_rate")}
                      title="(likes + comments + saves) / reach × 100"
                    >
                      Engajamento <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 gap-1"
                      onClick={() => toggleSort("follows")}
                      title="Seguidores ganhos via este post (Graph API)"
                    >
                      <UserPlus className="h-3 w-3" />
                      Seguidores <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("timestamp")}>
                      Data <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  {showLinkColumn && <TableHead className="w-24 text-right">Etapa</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((post) => {
                  const thumb = post.thumbnail_url ?? post.media_url;
                  const linkedCount = linkedCountByMediaId.get(post.id) ?? 0;
                  const captionPreview = post.caption ?? "—";
                  return (
                    <TableRow key={post.id}>
                      <TableCell>
                        {thumb ? (
                          <div className="relative h-10 w-10 overflow-hidden rounded">
                            <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm">{captionPreview}</p>
                      </TableCell>
                      <TableCell className="text-sm">{post.like_count?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                      <TableCell className="text-sm">{post.comments_count?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                      <TableCell
                        className={`text-sm whitespace-nowrap ${engagementColor(post.engagement_rate)}`}
                        title={buildEngagementTooltip(post)}
                      >
                        {fmtEngagement(post.engagement_rate)}
                      </TableCell>
                      <TableCell
                        className={`text-sm whitespace-nowrap ${followsColor(getDisplayFollows(post).value)}`}
                        title={buildFollowsTooltip(post, getDisplayFollows(post))}
                      >
                        {(() => {
                          const d = getDisplayFollows(post);
                          return fmtFollows(d.value, d.estimated);
                        })()}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(post.timestamp), "dd/MM/yy")}
                      </TableCell>
                      {showLinkColumn && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() =>
                              setLinkModal({
                                mediaId: post.id,
                                title:
                                  captionPreview.length > 80
                                    ? `${captionPreview.slice(0, 77)}...`
                                    : captionPreview,
                              })
                            }
                            title="Vincular a uma etapa do funil"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {linkedCount > 0 && (
                              <span className="text-xs font-medium">{linkedCount}</span>
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {projectId && linkModal && (
        <LinkPostToStageModal
          projectId={projectId}
          source="instagram"
          externalId={linkModal.mediaId}
          postTitle={linkModal.title}
          open={!!linkModal}
          onOpenChange={(o) => { if (!o) setLinkModal(null); }}
        />
      )}
    </Card>
  );
}
