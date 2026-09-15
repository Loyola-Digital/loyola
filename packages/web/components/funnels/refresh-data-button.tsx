"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  CHAVE_CREATIVE_PERFORMANCE,
  chaveDaQueryKey,
  pedidosDeRecomputo,
} from "@/lib/utils/recomputo-creative-performance";

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
  // Desempenho de Criativos + Testes de LPs — desde a 18.81 é UMA query só,
  // com cache de 2h no banco. Invalidar não basta: a API devolveria o mesmo
  // cache. O passo 1.5 abaixo pede o recomputo (`refresh=1`) antes do refetch.
  CHAVE_CREATIVE_PERFORMANCE,
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

      // 1.5 (Story 18.81) Pede recomputo ao vivo das queries de
      // creative-performance que estão na tela — só delas, e só desta vez. O
      // queryFn consome o pedido e põe `refresh=1` na URL; a API ignora o cache
      // de 2h e recomputa. Sem isso o botão prometia e não entregava (D1).
      // `type: "active"` (QA REQ-001): sem ele, o pedido ia também para
      // queries INATIVAS (etapas visitadas há < 30 min, ainda no cache) e
      // ficava pendente até o gestor voltar lá — um recompute de ~25 s que
      // ninguém pediu, contra a AC3.
      for (const q of qc.getQueryCache().findAll({ queryKey: [CHAVE_CREATIVE_PERFORMANCE], type: "active" })) {
        const chave = chaveDaQueryKey(q.queryKey);
        if (chave) pedidosDeRecomputo.pedir(chave);
      }

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
