"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Play, Heart, Share2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { MediaListResponse } from "@/lib/hooks/use-instagram";

interface ReelsSectionProps {
  data?: MediaListResponse;
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const fmtN = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const pctOf = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(0)}%` : "—");

export function ReelsSection({ data, isLoading, onRefresh, isRefreshing }: ReelsSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Reels Recentes</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum reel encontrado</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.data.map((reel) => {
              const thumb = reel.thumbnail_url ?? reel.media_url;
              return (
                <div key={reel.id}>
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted">
                    {thumb ? (
                      <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                    <p className="truncate">{reel.caption ?? "—"}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {reel.reach != null && <span title="Reach (alcance único)">👁 {fmtN(reel.reach)}</span>}
                      {reel.views != null && <span title="Plays (reproduções)">▶ {fmtN(reel.views)}</span>}
                      <span className="flex items-center gap-0.5" title="Curtidas"><Heart className="h-3 w-3" />{fmtN(reel.like_count)}</span>
                      {reel.comments_count != null && <span title="Comentários">💬 {fmtN(reel.comments_count)}</span>}
                      {reel.saved != null && <span title="Saves">🔖 {fmtN(reel.saved)}</span>}
                      {reel.shares != null && (
                        <span className="flex items-center gap-0.5" title="Compartilhamentos"><Share2 className="h-3 w-3" />{fmtN(reel.shares)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {reel.avg_watch_time_ms != null && (
                        <span title="Retenção — tempo médio assistido">⏱ {(reel.avg_watch_time_ms / 1000).toFixed(1)}s</span>
                      )}
                      {reel.views != null && reel.reach != null && reel.reach > 0 && (
                        <span title="Replay = Plays ÷ Reach (>100% = revendo)">🔁 {pctOf(reel.views, reel.reach)}</span>
                      )}
                      {reel.saved != null && reel.reach != null && reel.reach > 0 && (
                        <span title="Save rate = Saves ÷ Reach">🔖 {pctOf(reel.saved, reel.reach)}</span>
                      )}
                      {reel.shares != null && reel.reach != null && reel.reach > 0 && (
                        <span title="Share rate = Shares ÷ Reach">↗ {pctOf(reel.shares, reel.reach)}</span>
                      )}
                      {reel.engagement_rate != null && (
                        <span title="Engajamento (likes+comentários+saves ÷ reach)">⚡ {reel.engagement_rate.toFixed(1)}%</span>
                      )}
                    </div>
                    <p>{format(parseISO(reel.timestamp), "dd/MM/yy")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
