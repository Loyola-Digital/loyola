"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/lib/hooks/use-api-client";

/**
 * Botão "Atualizar" — força refetch imediato dos dados do dashboard.
 *
 * Dois passos em sequência:
 * 1. Invalida cache in-memory do backend (30s TTL por default) via POST
 *    /api/google-sheets/invalidate-cache
 * 2. Invalida todas as queries React Query cujo prefixo leia planilha —
 *    força o frontend a refetchar, e o backend responde com dados frescos
 *    da Google Sheets API.
 */
const SHEET_QUERY_PREFIXES = [
  "stage-sales-data",
  "creative-revenue",
  "funnel-spreadsheets",
  "google-sheets-data",
  "google-sheets-sheets",
  "google-sheets-spreadsheets",
  "funnel-surveys-summary",
  "funnel-surveys",
  "meta-ads-comparison",
  "sales-ascension",
];

export function RefreshDataButton() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      // 1. Limpa cache do backend
      await apiClient("/api/google-sheets/invalidate-cache", { method: "POST", body: JSON.stringify({}) });

      // 2. Invalida todas as queries que leem planilha (refetch disparado
      // automaticamente pelos componentes que estão montados)
      await qc.invalidateQueries({
        predicate: (query) => {
          const first = query.queryKey[0];
          return typeof first === "string" && SHEET_QUERY_PREFIXES.includes(first);
        },
      });

      toast.success("Dados atualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar dados");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="gap-1.5"
      title="Atualiza planilhas e métricas agora (ignora cache)"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      {isRefreshing ? "Atualizando..." : "Atualizar"}
    </Button>
  );
}
