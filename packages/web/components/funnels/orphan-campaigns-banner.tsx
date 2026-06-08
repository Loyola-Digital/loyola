"use client";

import { AlertTriangle, Settings2, EyeOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useOrphanCampaigns, useDismissOrphanCampaigns } from "@/lib/hooks/use-funnels";
import { useUserRole } from "@/lib/hooks/use-user-role";
import type { OrphanCampaign } from "@loyola-x/shared";

interface OrphanCampaignsBannerProps {
  projectId: string;
  funnelId: string;
  /** Quando passado, banner mostra órfãs DESTA etapa específica.
   *  Quando ausente, mostra agregado do funil (órfãs em nenhuma etapa). */
  stageId?: string;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  PAUSED: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  ARCHIVED: "bg-muted/40 text-muted-foreground border-border/30",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.ARCHIVED;
  return (
    <span className={`inline-flex items-center rounded-sm border px-1 py-0 text-[9px] font-medium uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

export function OrphanCampaignsBanner({
  projectId,
  funnelId,
  stageId,
}: OrphanCampaignsBannerProps) {
  const { data, isLoading } = useOrphanCampaigns(projectId, funnelId);
  const dismiss = useDismissOrphanCampaigns(projectId, funnelId);
  const role = useUserRole();
  const canEdit = role !== null && role !== "guest";

  if (isLoading || !data || !data.hasMatchCode) return null;

  // Lista de órfãs a exibir depende do contexto
  let orphans: OrphanCampaign[];
  if (stageId) {
    orphans = data.byStage[stageId]?.orphans ?? [];
  } else {
    orphans = data.orphans;
  }

  if (orphans.length === 0) return null;

  const visible = orphans.slice(0, 5);
  const hidden = orphans.length - visible.length;
  const matchCode = data.matchCode;

  const message = stageId
    ? `${orphans.length} ${orphans.length === 1 ? "campanha" : "campanhas"} Meta com `
    : `${orphans.length} ${orphans.length === 1 ? "campanha" : "campanhas"} Meta com `;
  const messageSuffix = stageId
    ? ` ${orphans.length === 1 ? "não está" : "não estão"} selecionada${orphans.length === 1 ? "" : "s"} nesta etapa`
    : ` ${orphans.length === 1 ? "não está" : "não estão"} em nenhuma etapa do funil`;

  function handleDismiss() {
    const ids = orphans.map((c) => c.id);
    dismiss.mutate(ids, {
      onSuccess: () =>
        toast.success(
          ids.length === 1 ? "Campanha ocultada do aviso" : `${ids.length} campanhas ocultadas do aviso`,
        ),
      onError: () => toast.error("Não foi possível ocultar. Tente novamente."),
    });
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {canEdit && (
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismiss.isPending}
              className="float-right ml-2 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
              title="Ocultar este aviso pra todos os usuários do projeto"
            >
              <EyeOff className="h-3 w-3" />
              {dismiss.isPending ? "Ocultando..." : "Ocultar"}
            </button>
          )}
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold">⚠️ {message}</span>
            <code className="font-mono bg-amber-500/20 rounded px-1 py-0.5 mx-0.5 text-[12px]">{matchCode}</code>
            <span>{messageSuffix}</span>
          </p>

          <ul className="mt-2 space-y-1">
            {visible.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                <StatusBadge status={c.status} />
                <span className="truncate">{c.name}</span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="text-[10px] text-amber-700 dark:text-amber-400">
                +{hidden} {hidden === 1 ? "outra campanha" : "outras campanhas"}
              </li>
            )}
          </ul>

          {stageId ? (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
              Abra o painel <span className="font-medium">Configurar Etapa</span> e marque as campanhas faltantes.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
              <Settings2 className="h-3 w-3" />
              <Link href={`/projects/${projectId}/funnels/${funnelId}`} className="underline hover:no-underline">
                Abra cada etapa do funil e selecione
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
