"use client";

import { useParams } from "next/navigation";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { Skeleton } from "@/components/ui/skeleton";

export default function FunnelPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const { data, isLoading } = useFunnel(params.id, params.funnelId);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Funil não encontrado</p>
      </div>
    );
  }

  const { funnel, campaignId, funnelType } = data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{funnel.name}</h1>
        <p className="text-sm text-muted-foreground">
          {funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"}
          {funnel.campaignName && ` — ${funnel.campaignName}`}
        </p>
      </div>

      {!campaignId ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            Nenhuma campanha vinculada a este funil.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Edite o funil para vincular uma campanha do Meta Ads.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Dashboard {funnelType === "launch" ? "de Lançamento" : "Perpétuo"} — Campanha: {funnel.campaignName ?? campaignId}
          <br />
          <span className="text-xs">Stories 10.5/10.6 implementarão os dashboards completos.</span>
        </div>
      )}
    </div>
  );
}
