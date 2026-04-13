"use client";

import { useState, useEffect, useRef } from "react";
import { Brain, Sparkles, X, MessageSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

export interface DebateTurn {
  speaker: "current" | "consulted";
  mindName: string;
  message: string;
  type: "question" | "response";
  timestamp: number;
}

interface DebateCardProps {
  turns: DebateTurn[];
  currentMindName: string;
  isActive: boolean;
  onStop?: () => void;
}

// ============================================================
// COMPACT CARD (inline in chat — clean, not polluted)
// ============================================================

export function DebateCard({ turns, currentMindName, isActive, onStop }: DebateCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const consultedName = turns.find((t) => t.speaker === "consulted")?.mindName ?? "Mind";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-gradient-to-r from-primary/5 to-amber-500/5 p-3 cursor-pointer hover:border-primary/30 transition-all",
          isActive ? "border-primary/20" : "border-border/30"
        )}
        onClick={() => setModalOpen(true)}
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border-2 border-background z-10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center border-2 border-background">
              <Brain className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Reuniao com {consultedName}
              {isActive && <Sparkles className="inline h-3 w-3 ml-1 text-amber-500 animate-pulse" />}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isActive ? "Em andamento..." : `✓ Concluida • ${turns.length} turnos`}
            </p>
          </div>
          {isActive && onStop && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); onStop(); }}
            >
              <Square className="h-3 w-3 fill-current" />
              Parar
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Ver reuniao
          </Button>
        </div>
      </div>

      {modalOpen && (
        <DebateModal
          turns={turns}
          currentMindName={currentMindName}
          consultedName={consultedName}
          isActive={isActive}
          onStop={onStop}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ============================================================
// FULL MODAL
// ============================================================

function DebateModal({ turns, currentMindName, consultedName, isActive, onStop, onClose }: {
  turns: DebateTurn[];
  currentMindName: string;
  consultedName: string;
  isActive: boolean;
  onStop?: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl m-4 max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border-2 border-background z-10">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center border-2 border-background">
                <Brain className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">{currentMindName} x {consultedName}</p>
              <p className="text-[10px] text-muted-foreground">{turns.length} turnos</p>
            </div>
            {isActive && (
              <div className="flex items-center gap-1.5 ml-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-500 font-medium">Ao vivo</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isActive && onStop && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onStop}
              >
                <Square className="h-3 w-3 fill-current" />
                Interromper
              </Button>
            )}
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {turns.map((turn, i) => {
            const isLeft = turn.speaker === "current";
            const name = isLeft ? currentMindName : turn.mindName;

            return (
              <div
                key={i}
                className={cn("flex gap-3 animate-in duration-400", isLeft ? "fade-in slide-in-from-left-3" : "fade-in slide-in-from-right-3")}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={cn("shrink-0 h-9 w-9 rounded-full flex items-center justify-center", isLeft ? "bg-primary/15" : "bg-amber-500/15")}>
                  <Brain className={cn("h-4 w-4", isLeft ? "text-primary" : "text-amber-500")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[11px] font-semibold mb-1", isLeft ? "text-primary/80" : "text-amber-500/80")}>{name}</p>
                  <div className={cn("rounded-xl px-4 py-3 text-sm leading-relaxed", isLeft ? "bg-primary/5 border border-primary/10" : "bg-amber-500/5 border border-amber-500/10")}>
                    <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{turn.message}</ReactMarkdown></div>
                  </div>
                </div>
              </div>
            );
          })}

          {isActive ? (
            <div className="flex gap-3 animate-in fade-in duration-300">
              <div className="h-9 w-9 rounded-full bg-muted/20 flex items-center justify-center">
                <Brain className="h-4 w-4 text-muted-foreground animate-pulse" />
              </div>
              <div className="bg-muted/10 border border-border/20 rounded-xl px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          ) : turns.length > 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 animate-in fade-in duration-300">
              <span className="text-emerald-500 text-sm">✓</span>
              <p className="text-sm text-emerald-400">Reuniao encerrada — resultado no chat</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
