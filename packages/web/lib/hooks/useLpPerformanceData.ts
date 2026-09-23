"use client";

/**
 * Story 18.44 / 18.46: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Story 18.83 — a LP é o link que a pessoa viu:
 * - Com a API nova, a resposta traz `lpPorAnuncio` (uma entrada por anúncio, com
 *   a URL de destino do criativo). Cada linha é uma URL normalizada; gasto,
 *   cliques, LP View, pixel, vendas e ingressos entram POR ANÚNCIO, e o lead
 *   pago entra pelo `utm_content` dele — todos pelo mesmo mapa `ad_id → URL`,
 *   que também aplica a correção manual por campanha (`lpCampaignUrls` da
 *   etapa). A regra mora em `lib/utils/lps-do-lancamento.ts`, com teste.
 * - Com a API anterior (sem `lpPorAnuncio`), segue o caminho da 18.46: uma linha
 *   por rótulo `lpX` do nome da campanha (sem lpX → LPA) — a tela fica como era,
 *   sem erro.
 * - Filtro de público (hot/cold/todos): gasto e vendas pela temperatura da
 *   CAMPANHA; o lead pelo texto do próprio lead (PO-07).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useCrossReferenceLeads } from "@/lib/hooks/useCrossReferenceLeads";
import { useFunnelStage } from "@/lib/hooks/use-funnel-stages";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import { leadsDaLp } from "@/lib/utils/leads-da-lp";
import { montarLinhasDeLpPorUrl, type LpRow } from "@/lib/utils/lps-do-lancamento";
import {
  opcoesDaQueryCreativePerformance,
  type StageCreativePerformanceResponse,
} from "@/lib/hooks/useStageCreativePerformance";
import type { CacheDaResposta } from "@/lib/utils/recomputo-creative-performance";

export type { LpRow };

interface LpPerformanceResult {
  lps: LpRow[];
  isLoading: boolean;
  error?: string;
  /** Story 18.81: `_cache` da resposta — a tela avisa quando é cache vencido. */
  cache?: CacheDaResposta;
  /**
   * Story 18.83: `url` = linhas por URL do anúncio (API nova); `rotulo` = por
   * `lpX` do nome da campanha (API anterior). A tabela escolhe o lápis ou a
   * correção por campanha por aqui.
   */
  modo: "url" | "rotulo";
  /** Correções por campanha em vigor na etapa (campaign_id → URL). */
  correcoes: Record<string, string>;
}

interface UseLpPerformanceDataOptions {
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
  publicoFilter?: "hot" | "cold" | "todos";
}

export function useLpPerformanceData({
  projectId,
  funnelId,
  stageId,
  days = 30,
  publicoFilter = "todos",
}: UseLpPerformanceDataOptions): LpPerformanceResult {
  const apiClient = useApiClient();

  // creative-performance traz `lpPorAnuncio` (18.83) e `lpBreakdown` (18.46).
  // Story 18.81: MESMA query da tabela de Criativos (queryKey compartilhada) —
  // um request por página, e o Atualizar recomputa as duas de uma vez.
  const creativesQuery = useQuery<StageCreativePerformanceResponse, Error>({
    ...opcoesDaQueryCreativePerformance(apiClient, funnelId, stageId, days),
    enabled: !!funnelId && !!stageId,
  });

  // Leads por LP (via planilha n8n), quebrados por temperatura
  const leadsQuery = useCrossReferenceLeads({
    projectId,
    funnelId,
    stageId,
    days,
  });

  // Story 18.83 (AC5): a correção manual por campanha vive na etapa. A query é
  // a mesma que o dashboard já usa (queryKey compartilhada) — sem fetch novo.
  const { data: stage } = useFunnelStage(projectId, funnelId, stageId);
  const correcoes = useMemo(() => stage?.lpCampaignUrls ?? {}, [stage?.lpCampaignUrls]);

  const lpPorAnuncio = creativesQuery.data?.lpPorAnuncio;

  const result = useMemo(() => {
    // Imposto Meta aplica a partir de 2026; o breakdown é agregado no período,
    // sem data por linha — usamos a data atual (lançamentos correntes são 2026+).
    const taxDate = new Date().toISOString().slice(0, 10);

    if (lpPorAnuncio) {
      return {
        lps: montarLinhasDeLpPorUrl({
          lpPorAnuncio,
          correcoes,
          leadsPorAnuncio: leadsQuery.leadsPagosPorAnuncio,
          publico: publicoFilter,
          dataDoImposto: taxDate,
        }),
        modo: "url" as const,
      };
    }

    const breakdown = creativesQuery.data?.lpBreakdown;
    if (!breakdown || breakdown.length === 0) {
      return { lps: [] as LpRow[], modo: "rotulo" as const };
    }

    const lpTotals: Record<string, LpRow> = {};
    // Leads do pixel por LP, já no recorte Hot/Cold (cada entry é LP×temperatura).
    const pixelPorLp: Record<string, number> = {};

    for (const entry of breakdown) {
      // Story 18.46 (AC7): filtro de público pela temperatura do breakdown
      if (publicoFilter !== "todos" && entry.temperature !== publicoFilter) continue;

      const key = entry.lpName.toLowerCase();
      if (!lpTotals[key]) {
        lpTotals[key] = {
          lpName: entry.lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: 0,
          lpViews: 0,
          leads: 0,
          vendas: 0,
          faturamento: 0,
          ingressosUnicos: 0,
          ingressosTotais: 0,
          revenueUnico: 0,
          revenueTotal: 0,
        };
      }
      // Imposto Meta Ads de 12,15% (2026+): o spend cru da API não inclui. Aplica
      // pra bater com o card de Investimento / Dados Diários (que já usam applyMetaAdsTax).
      lpTotals[key].investimento += applyMetaAdsTax(entry.spend, taxDate);
      lpTotals[key].cliques += entry.clicks;
      lpTotals[key].impressoes += entry.impressions;
      lpTotals[key].conversoes += entry.clicks; // conversão = clique (chegada à LP)
      lpTotals[key].lpViews += entry.landingPageViews;
      pixelPorLp[key] = (pixelPorLp[key] ?? 0) + (entry.pixelLeads ?? 0);
      // Story 18.50: vendas/faturamento por LP (atribuídos no backend via co= →
      // campanha). Somados respeitando o mesmo filtro de público do spend, já que
      // cada entry é LP×temperatura — o ROAS por LP fica consistente com o gasto.
      lpTotals[key].vendas = (lpTotals[key].vendas ?? 0) + (entry.vendas ?? 0);
      lpTotals[key].faturamento = (lpTotals[key].faturamento ?? 0) + (entry.faturamento ?? 0);
      // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP — somados sob o
      // mesmo filtro de público (cada entry é LP×temperatura, já filtrado acima).
      lpTotals[key].ingressosUnicos = (lpTotals[key].ingressosUnicos ?? 0) + (entry.ingressosUnicos ?? 0);
      lpTotals[key].ingressosTotais = (lpTotals[key].ingressosTotais ?? 0) + (entry.ingressosTotais ?? 0);
      lpTotals[key].revenueUnico = (lpTotals[key].revenueUnico ?? 0) + (entry.revenueUnico ?? 0);
      lpTotals[key].revenueTotal = (lpTotals[key].revenueTotal ?? 0) + (entry.revenueTotal ?? 0);
    }

    // Story 18.46 (AC6/AC7): leads por LP, respeitando o filtro de público.
    // LP sem formulário (nenhum lead na planilha) conta pelo pixel.
    for (const key of Object.keys(lpTotals)) {
      const { leads, fonte } = leadsDaLp(
        leadsQuery.leadsByLp?.[key],
        pixelPorLp[key] ?? 0,
        publicoFilter,
      );
      lpTotals[key].leads = leads;
      lpTotals[key].leadsFonte = fonte;
    }

    // Story 18.46 (AC2): uma linha por LP, ordenado por investimento desc
    const lps = Object.values(lpTotals).sort(
      (a, b) => b.investimento - a.investimento,
    );

    return { lps, modo: "rotulo" as const };
  }, [
    lpPorAnuncio,
    correcoes,
    creativesQuery.data?.lpBreakdown,
    leadsQuery.leadsByLp,
    leadsQuery.leadsPagosPorAnuncio,
    publicoFilter,
  ]);

  return {
    lps: result.lps,
    modo: result.modo,
    correcoes,
    isLoading: creativesQuery.isLoading || leadsQuery.isLoading,
    error: creativesQuery.error?.message || leadsQuery.error,
    cache: creativesQuery.data?._cache,
  };
}
