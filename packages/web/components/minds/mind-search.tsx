"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

interface MindSearchProps {
  onSearch: (query: string) => void;
}

export function MindSearch({ onSearch }: MindSearchProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="relative mx-auto max-w-lg">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar minds por nome ou especialidade..."
        className="h-12 w-full rounded-xl border border-border/60 bg-card px-12 py-3 text-sm shadow-sm transition-all placeholder:text-muted-foreground/50 focus:border-ring/50 focus:outline-none focus:shadow-[0_0_0_3px_hsl(var(--color-ring)/0.1)]"
      />
      <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/50 sm:flex">
        Ctrl K
      </kbd>
    </div>
  );
}
