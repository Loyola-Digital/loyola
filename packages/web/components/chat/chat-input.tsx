"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  mindName?: string;
}

export function ChatInput({ onSend, disabled, mindName }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, []);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-colors focus-within:border-ring/50 focus-within:shadow-[0_0_0_1px_hsl(var(--color-ring)/0.2)]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={mindName ? `Mensagem para ${mindName}...` : "Digite sua mensagem..."}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
              canSend
                ? "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover hover:shadow-md active:scale-95"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/50">
          Enter para enviar, Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
