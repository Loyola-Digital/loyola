"use client";

import { useParams } from "next/navigation";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { Skeleton } from "@/components/ui/skeleton";
import { LaunchDashboard } from "@/components/funnels/launch-dashboard";
import { PerpetualDashboard } from "@/components/funnels/perpetual-dashboard";
import { YouTubeFunnelSection } from "@/components/funnels/youtube-funnel-section";

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
          {funnel.campaigns.length > 0 && ` — ${funnel.campaigns.length} campanha${funnel.campaigns.length > 1 ? "s" : ""} Meta`}
          {funnel.googleAdsCampaigns.length > 0 && ` · ${funnel.googleAdsCampaigns.length} campanha${funnel.googleAdsCampaigns.length > 1 ? "s" : ""} YouTube`}
        </p>
      </div>

      {/* Meta Ads Dashboard */}
      {funnelType === "launch" ? (
        <LaunchDashboard funnel={funnel} projectId={params.id} />
      ) : (
        <PerpetualDashboard funnel={funnel} projectId={params.id} />
      )}

      {/* YouTube Ads Section (collapsible) */}
      <YouTubeFunnelSection funnel={funnel} projectId={params.id} days={30} />
    </div>
  );
}
