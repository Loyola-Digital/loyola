"use client";

import Link from "next/link";
import { ScrollText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Epic 38 / Story 38.1 — pontos de entrada do Log de Campanha.
// O log é FIXO por funil (não é funnel_stage): card sempre presente no grid
// do funil + botão de atalho no header das páginas de etapa (funil de 1 etapa
// faz auto-redirect e nunca mostra o grid).

function logHref(projectId: string, funnelId: string): string {
  return `/projects/${projectId}/funnels/${funnelId}/campaign-log`;
}

/** Card fixo exibido no grid de etapas do funil (sem drag, sem delete). */
export function CampaignLogCard({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  return (
    <Link href={logHref(projectId, funnelId)} className="block group">
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <ScrollText className="h-4 w-4 shrink-0 text-indigo-500" />
              <p className="font-semibold text-sm truncate">Log de Campanha</p>
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                Fixa
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Disparos, publicações e ajustes — tudo que foi feito na campanha
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}

/** Botão de atalho pro header das páginas de etapa. */
export function CampaignLogButton({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5" asChild>
      <Link href={logHref(projectId, funnelId)}>
        <ScrollText className="h-3.5 w-3.5 text-indigo-500" />
        Log
      </Link>
    </Button>
  );
}
