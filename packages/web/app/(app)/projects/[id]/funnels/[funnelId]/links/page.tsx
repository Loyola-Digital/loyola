"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { SwitchyFunnelSection } from "@/components/funnels/switchy-funnel-section";

/**
 * Os links da campanha, em página própria.
 *
 * Antes isto era uma seção no fim da página do funil — longe demais para quem
 * precisa dela, e invisível em funil de uma etapa, que faz auto-redirect e
 * nunca mostra aquela página. Agora tem card fixo no grid e botão no header de
 * toda etapa, como o Log de Campanha.
 */
export default function FunnelLinksPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const { data: funnelData, isLoading } = useFunnel(params.id, params.funnelId);

  return (
    <div className="p-6 space-y-6">
      <div className="min-w-0">
        <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
          <Link href={`/projects/${params.id}/funnels/${params.funnelId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {funnelData?.funnel.name ?? "Funil"}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-purple-500" />
          <h1 className="text-2xl font-bold">Links</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Os links desta campanha — gerar com UTM, o histórico do que já saiu e os cliques de cada um.
        </p>
      </div>

      {isLoading || !funnelData ? (
        <Skeleton className="h-64" />
      ) : (
        <SwitchyFunnelSection
          projectId={params.id}
          funnelId={params.funnelId}
          funnelName={funnelData.funnel.name}
          funnel={funnelData.funnel}
        />
      )}
    </div>
  );
}
