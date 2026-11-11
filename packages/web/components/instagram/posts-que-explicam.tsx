"use client";

/**
 * Quatro posts, quatro perguntas diferentes.
 *
 * Não é um "top 4": o post que mais alcançou quase nunca é o que mais foi
 * compartilhado, e quase nunca é o que trouxe seguidor. Um ranking único
 * esconde isso e faz o time repetir o formato errado.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { Dica } from "@/components/instagram/dica";
import { NOME_DO_FORMATO, formatoDoPost } from "@/lib/utils/instagram-posts";
import { destaquesDoPeriodo } from "@/lib/utils/instagram-sinal";

interface Props {
  posts?: InstagramMedia[];
  isLoading: boolean;
  /** Abre o post dentro do app, quando a tela souber fazer isso. */
  onAbrir?: (post: InstagramMedia) => void;
}

export function PostsQueExplicam({ posts, isLoading, onAbrir }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  const destaques = destaquesDoPeriodo(posts ?? []);
  if (destaques.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Posts que explicam o período</CardTitle>
          <Dica>
            {`Cada cartão responde uma pergunta diferente — e raramente é o mesmo post.

Mais viu: maior alcance. Mais espalhou: mais compartilhamentos e salvamentos por mil alcançados. Melhor gancho: maior parcela que passou dos 3 primeiros segundos (só Reels). Mais seguidores: quem mais trouxe gente nova.`}
          </Dica>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {destaques.map(({ pergunta, post, valor }) => {
            const thumb = post.thumbnail_url ?? post.media_url;
            return (
              <article
                key={pergunta}
                className="group flex flex-col gap-2 rounded-xl border border-border/40 bg-card/60 p-3 transition-colors hover:border-border"
              >
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {pergunta}
                </span>
                <div className="flex gap-2">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded object-cover"
                      onClick={() => onAbrir?.(post)}
                      role={onAbrir ? "button" : undefined}
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums">{valor}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {NOME_DO_FORMATO[formatoDoPost(post)]} ·{" "}
                      {format(parseISO(post.timestamp), "dd/MM")}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption ?? "Sem legenda"}</p>
                {post.permalink && (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Abrir no Instagram
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
