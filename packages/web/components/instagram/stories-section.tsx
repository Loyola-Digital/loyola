"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Eye, Users, MessageSquare, LogOut } from "lucide-react";
import Image from "next/image";
import type { StoryMedia } from "@/lib/hooks/use-instagram";

interface StoriesSectionProps {
  data?: StoryMedia[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function getInsight(story: StoryMedia, name: string): number | null {
  const entry = story.insights?.find((e) => e.name === name);
  if (!entry || entry.values.length === 0) return null;
  const v = entry.values[0].value;
  return typeof v === "number" ? v : null;
}

export function StoriesSection({ data, isLoading, onRefresh, isRefreshing }: StoriesSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Stories Ativos</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-28 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum story ativo</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {data.map((story) => {
              const impressions = getInsight(story, "impressions");
              const reach = getInsight(story, "reach");
              const replies = getInsight(story, "replies");
              const exits = getInsight(story, "exits");
              const thumb = story.media_url;

              return (
                <div key={story.id} className="shrink-0 w-28">
                  <div className="relative h-48 w-28 overflow-hidden rounded-lg bg-muted">
                    {thumb ? (
                      <Image src={thumb} alt="" fill className="object-cover" sizes="112px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Badge variant="secondary">{story.media_type}</Badge>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {impressions !== null && (
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />{impressions.toLocaleString("pt-BR")}
                      </div>
                    )}
                    {reach !== null && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />{reach.toLocaleString("pt-BR")}
                      </div>
                    )}
                    {replies !== null && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />{replies}
                      </div>
                    )}
                    {exits !== null && (
                      <div className="flex items-center gap-1">
                        <LogOut className="h-3 w-3" />{exits}
                      </div>
                    )}
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
