"use client";

import { useParams } from "next/navigation";
import { TrendingUp, Youtube, FileSpreadsheet, Table as TableIcon } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LaunchDashboard } from "@/components/funnels/launch-dashboard";
import { PerpetualDashboard } from "@/components/funnels/perpetual-dashboard";
import { YouTubeFunnelSection } from "@/components/funnels/youtube-funnel-section";
import { SurveyFunnelTab } from "@/components/funnels/survey-funnel-tab";
import { FunnelSpreadsheetsTab } from "@/components/funnels/funnel-spreadsheets-tab";
import { MetaAdsSpreadsheetTab } from "@/components/funnels/meta-ads-spreadsheet-tab";

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
        <p className="text-muted-foreground">Funil nao encontrado</p>
      </div>
    );
  }

  const { funnel, funnelType } = data;
  const metaCount = funnel.campaigns.length;
  const ytCount = funnel.googleAdsCampaigns.length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{funnel.name}</h1>
        <p className="text-sm text-muted-foreground">
          {funnelType === "launch" ? "Funil de Lancamento" : "Funil Perpetuo"}
        </p>
      </div>

      <Tabs defaultValue="meta-ads">
        <TabsList>
          <TabsTrigger value="meta-ads" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Meta Ads
            {metaCount > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{metaCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="meta-ads-2" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
            Meta Ads 2
          </TabsTrigger>
          <TabsTrigger value="youtube-ads" className="gap-1.5">
            <Youtube className="h-3.5 w-3.5 text-red-500" />
            YouTube Ads
            {ytCount > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{ytCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="surveys" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
            Pesquisas
          </TabsTrigger>
          <TabsTrigger value="spreadsheets" className="gap-1.5">
            <TableIcon className="h-3.5 w-3.5 text-blue-600" />
            Planilhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meta-ads" className="mt-6">
          {funnelType === "launch" ? (
            <LaunchDashboard funnel={funnel} projectId={params.id} />
          ) : (
            <PerpetualDashboard funnel={funnel} projectId={params.id} />
          )}
        </TabsContent>

        <TabsContent value="youtube-ads" className="mt-6">
          <YouTubeFunnelSection funnel={funnel} projectId={params.id} days={30} />
        </TabsContent>

        <TabsContent value="surveys" className="mt-6">
          <SurveyFunnelTab projectId={params.id} funnelId={params.funnelId} />
        </TabsContent>

        <TabsContent value="spreadsheets" className="mt-6">
          <FunnelSpreadsheetsTab projectId={params.id} funnelId={params.funnelId} />
        </TabsContent>

        <TabsContent value="meta-ads-2" className="mt-6">
          <MetaAdsSpreadsheetTab funnel={funnel} projectId={params.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
