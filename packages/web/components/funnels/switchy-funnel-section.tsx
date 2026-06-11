"use client";

import { useState } from "react";
import { Link2, ChevronDown, ChevronRight } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { SwitchyGenerator } from "@/components/switchy/switchy-generator";
import { SwitchyHistoryList } from "@/components/switchy/switchy-history-list";

interface Props {
  projectId: string;
  funnelId: string;
  /** Nome do funil — usado pra pré-preencher o utm_campaign do gerador. */
  funnelName: string;
}

/**
 * Seção "Switch — Gerador de Links" dentro da página do funil (Story 33.7).
 *
 * O funil é implícito: os links gerados aqui são atrelados a este `funnelId` e o
 * histórico abaixo mostra só os links deste funil. Config de pixels/presets vive
 * no tab Switch do projeto (config-only).
 *
 * Gating binário: leitura liberada; escrita (generate) só pra não-guest
 * (`role !== null && role !== "guest"`).
 */
export function SwitchyFunnelSection({ projectId, funnelId, funnelName }: Props) {
  const role = useUserRole();
  const canEdit = role !== null && role !== "guest";
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Switch — Gerador de Links</span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/20 p-5 space-y-6">
          <SwitchyGenerator
            projectId={projectId}
            canEdit={canEdit}
            funnelId={funnelId}
            defaultCampaign={funnelName}
          />
          <SwitchyHistoryList projectId={projectId} funnelId={funnelId} />
        </div>
      )}
    </div>
  );
}
