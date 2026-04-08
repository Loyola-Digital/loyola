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
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    <p className="truncate">{reel.caption ?? "—"}</p>
                    <div className="flex items-center gap-2">
                      {reel.like_count !== undefined && (
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-3 w-3" />{reel.like_count.toLocaleString("pt-BR")}
                        </span>
                      )}
                      {reel.comments_count !== undefined && (
                        <span className="flex items-center gap-0.5">
                          <Share2 className="h-3 w-3" />{reel.comments_count}
                        </span>
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
