"use client";

import { useState } from "react";
import { Loader2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThinkingStep } from "@/lib/hooks/use-chat-stream";

interface ThinkingIndicatorProps {
  steps: ThinkingStep[];
}

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (steps.length === 0) return null;

  const activeCount = steps.filter((s) => s.status === "running").length;
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-3">
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-5 w-5 items-center justify-center">
            {activeCount > 0 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            ) : (
              <Check className="h-3.5 w-3.5 text-brand" />
            )}
          </div>
          <span className="flex-1 text-xs font-medium text-muted-foreground">
            {activeCount > 0
              ? "Analisando..."
              : `${doneCount} ${doneCount === 1 ? "etapa concluida" : "etapas concluidas"}`}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
              collapsed && "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            collapsed ? "max-h-0" : "max-h-96",
          )}
        >
          <div className="space-y-1 px-4 pb-3">
            {steps.map((step) => (
              <div
                key={`${step.tool}-${step.timestamp}`}
                className={cn(
                  "flex items-center gap-2.5 text-xs transition-opacity duration-300",
                  step.status === "done"
                    ? "text-muted-foreground/50"
                    : "text-foreground",
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center">
                  {step.status === "running" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-brand" />
                  ) : (
                    <Check className="h-3 w-3 text-success" />
                  )}
                </div>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
