"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddDebriefingComment,
  useDebriefingComments,
  useDeleteDebriefingComment,
} from "@/lib/hooks/use-debriefings";

// Story 37.1 — comentários do debriefing: todos os não-guests veem quem
// deixou cada comentário (avatar + nome + data); só o autor exclui o próprio.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DebriefingComments({ debriefingId }: { debriefingId: string }) {
  const [text, setText] = useState("");
  const { data, isLoading } = useDebriefingComments(debriefingId);
  const addComment = useAddDebriefingComment(debriefingId);
  const deleteComment = useDeleteDebriefingComment(debriefingId);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addComment.mutate(trimmed, {
      onSuccess: () => setText(""),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Erro ao comentar"),
    });
  }

  const comments = data?.comments ?? [];

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" />
        Comentários{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum comentário ainda — seja a primeira pessoa a comentar.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-lg border border-border/40 p-3">
              <Avatar className="h-8 w-8 shrink-0">
                {c.userAvatarUrl && <AvatarImage src={c.userAvatarUrl} alt={c.userName} />}
                <AvatarFallback className="text-xs">{initials(c.userName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.createdAt), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                  </span>
                  {c.mine && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        deleteComment.mutate(c.id, {
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
                        })
                      }
                      aria-label="Excluir comentário"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder="Deixe um comentário para o time..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-20"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={addComment.isPending || !text.trim()}
          >
            {addComment.isPending ? "Enviando..." : "Comentar"}
          </Button>
        </div>
      </div>
    </section>
  );
}
