"use client";

import { useState, useCallback, useEffect } from "react";
import { LayoutGrid, Network } from "lucide-react";
import { useMinds } from "@/lib/hooks/use-minds";
import { MindSearch } from "@/components/minds/mind-search";
import { SquadGrid } from "@/components/minds/squad-grid";
import { MindsNetwork } from "@/components/minds/minds-network";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type ViewMode = "grid" | "network";
const STORAGE_KEY = "minds-view-mode";

export default function MindsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const { squads, isLoading, error } = useMinds(searchQuery || undefined);

  // Persist view preference
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (saved === "grid" || saved === "network") setViewMode(saved);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const hasResults = !isLoading && !error && squads && squads.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero section */}
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-card via-card to-brand/5 px-8 py-10 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(47_98%_54%/0.08),transparent_50%)]" />
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">
            Sua equipe de especialistas em{" "}
            <span className="text-brand">IA</span>
          </h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground leading-relaxed">
            Explore as mentes disponíveis e receba orientação estratégica personalizada
          </p>
          <div className="mt-6">
            <MindSearch onSearch={handleSearch} />
          </div>
        </div>
      </div>

      {/* View toggle */}
      {hasResults && (
        <div className="flex items-center justify-end gap-1 rounded-lg border border-border/40 bg-muted/30 p-1 w-fit ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewMode("grid")}
            className={
              viewMode === "grid"
                ? "bg-background shadow-sm text-foreground h-7 px-3"
                : "text-muted-foreground hover:text-foreground h-7 px-3"
            }
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Grid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewMode("network")}
            className={
              viewMode === "network"
                ? "bg-background shadow-sm text-foreground h-7 px-3"
                : "text-muted-foreground hover:text-foreground h-7 px-3"
            }
          >
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Rede Neural
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-32 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-center">
          <p className="text-sm text-destructive">
            Erro ao carregar minds. Tente novamente.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && squads && squads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
            <span className="text-2xl">🔍</span>
          </div>
          <p className="text-lg font-medium text-foreground/80">
            Nenhuma mind encontrada
          </p>
          {searchQuery && (
            <p className="mt-1 text-sm text-muted-foreground">
              Tente buscar com outros termos
            </p>
          )}
        </div>
      )}

      {/* Grid view */}
      {hasResults && viewMode === "grid" && (
        <SquadGrid squads={squads!} />
      )}

      {/* Network view */}
      {hasResults && viewMode === "network" && (
        <div className="h-[600px] rounded-2xl border border-border/30 bg-card/30 overflow-hidden">
          <MindsNetwork squads={squads!} />
        </div>
      )}
    </div>
  );
}
