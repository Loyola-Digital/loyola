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
import { RefreshCw, ArrowUpDown, Link2 } from "lucide-react";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { format, parseISO } from "date-fns";
import { useOrganicPostLinks } from "@/lib/hooks/use-organic-posts";
import { LinkPostToStageModal } from "@/components/funnels/link-post-to-stage-modal";

type SortKey = "timestamp" | "like_count" | "comments_count" | "engagement_rate";

interface PostsTableProps {
  data?: InstagramMedia[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  projectId?: string;
}

export function PostsTable({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  projectId,
}: PostsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortAsc, setSortAsc] = useState(false);
  const [linkModal, setLinkModal] = useState<{ mediaId: string; title: string } | null>(null);

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
    } else {
      diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    }
    return sortAsc ? diff : -diff;
  });

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
                        title={
                          post.reach != null
                            ? `Reach: ${post.reach.toLocaleString("pt-BR")} · Likes: ${post.like_count ?? 0} · Comments: ${post.comments_count ?? 0} · Saves: ${post.saved ?? 0}`
                            : "Reach indisponível para este post"
                        }
                      >
                        {fmtEngagement(post.engagement_rate)}
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
