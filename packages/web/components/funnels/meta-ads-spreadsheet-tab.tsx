"use client";

import { Loader2, FileSpreadsheet } from "lucide-react";
import type { Funnel } from "@loyola-x/shared";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import { CrossedFunnelDailyTable } from "./crossed-funnel-daily-table";
import { CplComparisonChart } from "./cpl-comparison-chart";
import { LeadsCumulativeChart } from "./leads-cumulative-chart";

interface MetaAdsSpreadsheetTabProps {
  funnel: Funnel;
  projectId: string;
}

export function MetaAdsSpreadsheetTab({ funnel, projectId }: MetaAdsSpreadsheetTabProps) {
  const days = 30;
  const metrics = useCrossedFunnelMetrics(projectId, funnel, days);

  if (metrics.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (funnel.campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma campanha Meta Ads vinculada a este funil.</p>
        <p className="text-xs">Configure as campanhas na aba Meta Ads para ver os dados cruzados.</p>
      </div>
    );
  }

  if (!metrics.hasLinkedSheet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma planilha vinculada a este funil.</p>
        <p className="text-xs">Vincule uma planilha na aba Planilhas para ver dados cruzados.</p>
      </div>
    );
  }

  if (metrics.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Sem dados para o periodo selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CrossedFunnelDailyTable rows={metrics.rows} totals={metrics.totals} />
      <CplComparisonChart rows={metrics.rows} />
      <LeadsCumulativeChart rows={metrics.rows} />
    </div>
  );
}
