"use client";

import { useEffect, useRef } from "react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MindOption {
  id: string;
  name: string;
  squad: string;
}

interface MindMentionPopupProps {
  minds: MindOption[];
  query: string;
  selectedIndex: number;
  onSelect: (mind: MindOption) => void;
  visible: boolean;
}

export function MindMentionPopup({ minds, query, selectedIndex, onSelect, visible }: MindMentionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? minds.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    : minds;

  const shown = filtered.slice(0, 8);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!visible || shown.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div
        ref={listRef}
        className="mx-auto max-w-3xl rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl overflow-hidden"
      >
        <div className="px-3 py-1.5 border-b border-border/30">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Consultar Mind</p>
        </div>
        <div className="max-h-[240px] overflow-y-auto py-1">
          {shown.map((mind, i) => (
            <button
              key={mind.id}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                i === selectedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
              )}
              onMouseDown={(e) => { e.preventDefault(); onSelect(mind); }}
            >
              <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{mind.name}</p>
                <p className="text-[10px] text-muted-foreground">{mind.squad}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
