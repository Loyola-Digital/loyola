"use client";

import { useParams } from "next/navigation";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { Skeleton } from "@/components/ui/skeleton";
import { LaunchDashboard } from "@/components/funnels/launch-dashboard";
import { PerpetualDashboard } from "@/components/funnels/perpetual-dashboard";

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

  const { funnel, funnelType } = data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{funnel.name}</h1>
        <p className="text-sm text-muted-foreground">
          {funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"}
          {funnel.campaigns.length > 0 && ` — ${funnel.campaigns.length} campanha${funnel.campaigns.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {funnelType === "launch" ? (
        <LaunchDashboard funnel={funnel} projectId={params.id} />
      ) : (
        <PerpetualDashboard funnel={funnel} projectId={params.id} />
      )}
    </div>
  );
}
