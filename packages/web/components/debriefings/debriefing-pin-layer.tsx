"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddDebriefingComment,
  useDebriefingComments,
  useDeleteDebriefingComment,
  type DebriefingComment,
} from "@/lib/hooks/use-debriefings";

// Story 37.3 — pins de comentário estilo Figma. Camada ABSOLUTA por cima do
// iframe do doc (o sandbox não é tocado): como a altura do iframe acompanha o
// doc (37.2), a âncora em % da largura/altura posiciona o pin no mesmo lugar
// do conteúdo. pointer-events: none no container; só pins/composer/overlay de
// posicionamento capturam clique.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Comentários ancorados, na ordem de criação (numeração estável dos pins). */
export function anchoredComments(
  comments: DebriefingComment[] | undefined,
): DebriefingComment[] {
  return (comments ?? []).filter(
    (c) => c.anchorX !== null && c.anchorY !== null,
  );
}

/** Posiciona um card flutuante perto da âncora sem estourar as bordas. */
function popoverPosition(x: number, y: number): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (x <= 55) style.left = `${x}%`;
  else style.right = `${100 - x}%`;
  if (y <= 85) style.top = `calc(${y}% + 14px)`;
  else style.bottom = `calc(${100 - y}% + 26px)`;
  return style;
}

export function DebriefingPinLayer({
  debriefingId,
  placing,
  onPlacingEnd,
  focusedId,
  onFocusChange,
}: {
  debriefingId: string;
  /** modo "comentar no doc": overlay de mira ativo aguardando o clique */
  placing: boolean;
  onPlacingEnd: () => void;
  focusedId: string | null;
  onFocusChange: (id: string | null) => void;
}) {
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const { data } = useDebriefingComments(debriefingId);
  const addComment = useAddDebriefingComment(debriefingId);
  const deleteComment = useDeleteDebriefingComment(debriefingId);

  const anchored = anchoredComments(data?.comments);
  const focused = anchored.find((c) => c.id === focusedId) ?? null;

  function handlePlaceClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) });
    setDraftText("");
    onFocusChange(null);
    onPlacingEnd();
  }

  function handleSaveDraft() {
    const text = draftText.trim();
    if (!text || !draft) return;
    addComment.mutate(
      { text, anchorX: draft.x, anchorY: draft.y },
      {
        onSuccess: () => {
          setDraft(null);
          setDraftText("");
          toast.success("Comentário fixado no doc!");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro ao comentar"),
      },
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Pins numerados */}
      {anchored.map((c, i) => (
        <button
          key={c.id}
          id={`debriefing-pin-${c.id}`}
          type="button"
          onClick={() => onFocusChange(focusedId === c.id ? null : c.id)}
          className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-full flex h-7 w-7 items-center justify-center rounded-full rounded-bl-none border-2 border-background bg-primary text-[11px] font-bold text-primary-foreground shadow-md transition-transform hover:scale-110 ${
            focusedId === c.id ? "scale-125 ring-2 ring-primary/40" : ""
          }`}
          style={{ left: `${c.anchorX}%`, top: `${c.anchorY}%` }}
          aria-label={`Comentário ${i + 1} de ${c.userName}`}
        >
          {i + 1}
        </button>
      ))}

      {/* Overlay de posicionamento (modo "comentar no doc") */}
      {placing && (
        <div
          className="pointer-events-auto absolute inset-0 cursor-crosshair bg-primary/5"
          onClick={handlePlaceClick}
        />
      )}

      {/* Composer flutuante do novo pin */}
      {draft && (
        <div
          className="pointer-events-auto absolute z-20 w-80 max-w-[85%] rounded-xl border border-border bg-card p-3 shadow-xl"
          style={popoverPosition(draft.x, draft.y)}
        >
          <Textarea
            autoFocus
            placeholder="Comente sobre este ponto do doc..."
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="min-h-20 text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={addComment.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDraft}
              disabled={addComment.isPending || !draftText.trim()}
            >
              {addComment.isPending ? "Enviando..." : "Comentar"}
            </Button>
          </div>
        </div>
      )}

      {/* Popover do comentário focado */}
      {focused && focused.anchorX !== null && focused.anchorY !== null && (
        <div
          className="pointer-events-auto absolute z-20 w-80 max-w-[85%] rounded-xl border border-border bg-card p-3 shadow-xl"
          style={popoverPosition(focused.anchorX, focused.anchorY)}
        >
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {focused.userAvatarUrl && (
                <AvatarImage src={focused.userAvatarUrl} alt={focused.userName} />
              )}
              <AvatarFallback className="text-[10px]">
                {initials(focused.userName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{focused.userName}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(focused.createdAt), "dd MMM, HH:mm", { locale: ptBR })}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {focused.mine && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    deleteComment.mutate(focused.id, {
                      onSuccess: () => onFocusChange(null),
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
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onFocusChange(null)}
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
            {focused.text}
          </p>
        </div>
      )}
    </div>
  );
}
