"use client";

import Link from "next/link";
import { Link2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Pontos de entrada dos Links da campanha, no mesmo molde do Log de Campanha
// (Story 38.1): card fixo no grid do funil + botão no header das páginas de
// etapa. Os dois são necessários — funil de UMA etapa faz auto-redirect e
// nunca mostra o grid, e era justamente nele que os links ficavam inalcançáveis.
//
// Os links são do FUNIL, não da etapa: o mesmo link curto serve o anúncio da
// captação e o e-mail da venda.

export function linksHref(projectId: string, funnelId: string): string {
  return `/projects/${projectId}/funnels/${funnelId}/links`;
}

/** Card fixo exibido no grid de etapas do funil (sem drag, sem delete). */
export function LinksCard({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  return (
    <Link href={linksHref(projectId, funnelId)} className="block group">
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Link2 className="h-4 w-4 shrink-0 text-purple-500" />
              <p className="font-semibold text-sm truncate">Links</p>
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                Fixa
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Gerar link com UTM, histórico da campanha e os cliques de cada um
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}

/** Botão de atalho pro header das páginas de etapa. */
export function LinksButton({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5" asChild>
      <Link href={linksHref(projectId, funnelId)}>
        <Link2 className="h-3.5 w-3.5 text-purple-500" />
        Links
      </Link>
    </Button>
  );
}
