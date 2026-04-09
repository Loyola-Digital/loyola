"use client";

import { useEffect, useRef } from "react";
import { Brain, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DebateTurn {
  speaker: "current" | "consulted";
  mindName: string;
  message: string;
  type: "question" | "response";
  timestamp: number;
}

interface DebateViewProps {
  turns: DebateTurn[];
  currentMindName: string;
  isActive: boolean;
}

export function DebateView({ turns, currentMindName, isActive }: DebateViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  if (turns.length === 0) return null;

  const consultedName = turns.find((t) => t.speaker === "consulted")?.mindName ?? "Mind";

  return (
    <div className="rounded-2xl border border-border/30 bg-gradient-to-br from-card/90 to-card/50 overflow-hidden mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium">{currentMindName}</span>
          </div>
          <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs font-medium">{consultedName}</span>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-500 font-medium">Ao vivo</span>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-3">
        {turns.map((turn, i) => {
          const isLeft = turn.speaker === "current";
          const name = isLeft ? currentMindName : turn.mindName;
          const isLatest = i === turns.length - 1;

          return (
            <div
              key={i}
              className={cn(
                "flex gap-3 animate-in duration-500",
                isLeft ? "fade-in slide-in-from-left-4" : "fade-in slide-in-from-right-4",
              )}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Avatar */}
              <div className={cn(
                "shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-all",
                isLeft ? "bg-primary/20" : "bg-amber-500/20",
                isLatest && isActive && "ring-2 ring-offset-2 ring-offset-background",
                isLatest && isActive && (isLeft ? "ring-primary/50" : "ring-amber-500/50"),
              )}>
                <Brain className={cn("h-4 w-4", isLeft ? "text-primary" : "text-amber-500")} />
              </div>

              {/* Bubble */}
              <div className={cn(
                "flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm",
                isLeft
                  ? "bg-primary/5 border border-primary/10"
                  : "bg-amber-500/5 border border-amber-500/10",
              )}>
                <p className={cn(
                  "text-[10px] font-semibold mb-1",
                  isLeft ? "text-primary/70" : "text-amber-500/70",
                )}>
                  {name}
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.message}</p>
              </div>
            </div>
          );
        })}

        {/* Typing indicator when active */}
        {isActive && (
          <div className="flex gap-3 animate-in fade-in duration-300">
            <div className="h-8 w-8 rounded-full bg-muted/30 flex items-center justify-center">
              <Brain className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="bg-muted/20 border border-border/20 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
