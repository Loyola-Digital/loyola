"use client";

import { useState, useCallback } from "react";
import { useMinds } from "@/lib/hooks/use-minds";
import { MindSearch } from "@/components/minds/mind-search";
import { SquadGrid } from "@/components/minds/squad-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function MindsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { squads, isLoading, error } = useMinds(searchQuery || undefined);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Mentes</h1>
        <p className="text-muted-foreground">
          Explore as mentes disponíveis e inicie uma conversa
        </p>
      </div>

      <MindSearch onSearch={handleSearch} />

      {isLoading && (
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-28 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-destructive">
          Erro ao carregar minds. Tente novamente.
        </p>
      )}

      {!isLoading && !error && squads && squads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Nenhuma mind encontrada
          </p>
          {searchQuery && (
            <p className="mt-1 text-sm text-muted-foreground">
              Tente buscar com outros termos
            </p>
          )}
        </div>
      )}

      {!isLoading && !error && squads && squads.length > 0 && (
        <SquadGrid squads={squads} />
      )}
    </div>
  );
}
