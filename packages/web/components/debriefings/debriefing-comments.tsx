"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddDebriefingComment,
  useDebriefingComments,
  useDeleteDebriefingComment,
  type DebriefingComment,
} from "@/lib/hooks/use-debriefings";

// Story 37.1/37.3 — comentários do debriefing: todos os não-guests veem quem
// deixou cada comentário; só o autor exclui o próprio. Comentários ancorados
// (pin no doc, estilo Figma) mostram badge numerado — clicar rola até o pin.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DebriefingComments({
  debriefingId,
  onPinSelect,
  focusedId,
}: {
  debriefingId: string;
  /** clique no badge de pin — a página rola até o pin e o destaca */
  onPinSelect?: (comment: DebriefingComment) => void;
  focusedId?: string | null;
}) {
  const [text, setText] = useState("");
  const { data, isLoading } = useDebriefingComments(debriefingId);
  const addComment = useAddDebriefingComment(debriefingId);
  const deleteComment = useDeleteDebriefingComment(debriefingId);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addComment.mutate(
      { text: trimmed },
      {
        onSuccess: () => setText(""),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro ao comentar"),
      },
    );
  }

  const comments = data?.comments ?? [];
  // Numeração dos pins = ordem de criação entre os ancorados (igual à camada de pins)
  const pinNumbers = new Map<string, number>();
  comments
    .filter((c) => c.anchorX !== null && c.anchorY !== null)
    .forEach((c, i) => pinNumbers.set(c.id, i + 1));

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
          Nenhum comentário ainda. Use &quot;Comentar no doc&quot; para fixar um
          comentário num ponto do documento, ou escreva um comentário geral
          abaixo.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const pin = pinNumbers.get(c.id);
            return (
              <li
                key={c.id}
                className={`flex gap-3 rounded-lg border p-3 transition-colors ${
                  focusedId === c.id
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/40"
                }`}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {c.userAvatarUrl && (
                    <AvatarImage src={c.userAvatarUrl} alt={c.userName} />
                  )}
                  <AvatarFallback className="text-xs">
                    {initials(c.userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.userName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(c.createdAt), "dd MMM, HH:mm", { locale: ptBR })}
                    </span>
                    {c.mine && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          deleteComment.mutate(c.id, {
                            onError: (e) =>
                              toast.error(
                                e instanceof Error ? e.message : "Erro ao excluir",
                              ),
                          })
                        }
                        aria-label="Excluir comentário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {pin !== undefined && (
                    <button
                      type="button"
                      onClick={() => onPinSelect?.(c)}
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                    >
                      <MapPin className="h-3 w-3" />
                      Pin {pin} — ver no doc
                    </button>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                    {c.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder="Comentário geral (sem pin)..."
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
