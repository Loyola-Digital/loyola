"use client";

import { ExternalLink, UserPlus, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopPostsByFollowers } from "@/lib/hooks/use-top-posts-by-followers";

interface TopPostsByFollowersCardProps {
  accountId: string | null;
  days: number;
  /** Quantidade de posts no ranking. Default 10. */
  limit?: number;
}

function fmtFollows(v: number): string {
  return `+${v.toLocaleString("pt-BR")}`;
}

export function TopPostsByFollowersCard({
  accountId,
  days,
  limit = 10,
}: TopPostsByFollowersCardProps) {
  const { data, isLoading, error } = useTopPostsByFollowers(accountId, days, limit);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Top Posts por Seguidores</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          últimos {days} dias
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Erro ao carregar ranking.
        </p>
      ) : !data || data.items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground space-y-1">
          <p>Nenhum post com dados de seguidores no período.</p>
          <p className="text-[10px]">
            A Graph API só retorna a métrica para alguns posts (depende do tipo
            de mídia e da idade).
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.items.map((post, i) => {
            const thumb = post.thumbnailUrl;
            const captionPreview = post.caption
              ? post.caption.length > 90
                ? `${post.caption.slice(0, 87)}...`
                : post.caption
              : "Sem legenda";
            const externalUrl =
              post.permalink ?? `https://www.instagram.com/p/${post.id}/`;
            return (
              <a
                key={post.id}
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md border border-border/20 bg-muted/10 p-2 hover:border-border/50 hover:bg-muted/20 transition-colors group"
              >
                <span className="w-5 text-center text-xs font-bold text-muted-foreground tabular-nums shrink-0">
                  {i + 1}
                </span>

                <div className="relative h-10 w-10 overflow-hidden rounded shrink-0 bg-muted">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : null}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs line-clamp-2 leading-snug">
                    {captionPreview}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(parseISO(post.timestamp), "dd/MM/yy")}
                    {post.mediaType ? ` · ${post.mediaType}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <UserPlus className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-sm font-semibold tabular-nums text-emerald-600">
                    {fmtFollows(post.follows)}
                  </span>
                </div>

                <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            );
          })}

          {data.totalEligible > data.totalWithData && (
            <p className="text-[10px] text-muted-foreground text-center pt-2">
              {data.totalWithData} de {data.totalEligible} posts no período retornaram a métrica
            </p>
          )}
        </div>
      )}
    </div>
  );
}
