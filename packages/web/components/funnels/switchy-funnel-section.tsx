"use client";

import { useState } from "react";
import { Link2, ChevronDown, ChevronRight } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { SwitchyGenerator } from "@/components/switchy/switchy-generator";
import { SwitchyHistoryList } from "@/components/switchy/switchy-history-list";
import { SwitchyLinksTab } from "@/components/funnels/switchy-links-tab";
import type { Funnel } from "@loyola-x/shared";

interface Props {
  projectId: string;
  funnelId: string;
  /** Nome do funil — usado pra pré-preencher o utm_campaign do gerador. */
  funnelName: string;
  /**
   * Com o funil, a seção também traz os **Links Vinculados** (os do Switchy,
   * com cliques), no escopo da campanha. A página do funil passa; a página da
   * etapa não, porque lá a tabela já vem depois, no escopo da etapa.
   */
  funnel?: Funnel;
}

/**
 * Os links da campanha: gerador de UTM, histórico e (no funil) os vinculados.
 *
 * O funil é implícito: os links gerados aqui são atrelados a este `funnelId` e o
 * histórico abaixo mostra só os links deste funil. Config de pixels/presets vive
 * no tab Switch do projeto (config-only).
 *
 * Na página do FUNIL isto é entrada fixa, no mesmo espírito do Log de Campanha:
 * toda campanha nasce com o lugar dos links, mesmo vazio. Antes a tabela de
 * vinculados só existia na aba Links das etapas de Captação — as outras nove
 * têm view dedicada e nunca chegam ao `<Tabs>` —, então campanha sem etapa de
 * captação não tinha onde guardar link nenhum.
 *
 * Gating binário: leitura liberada; escrita (generate) só pra não-guest
 * (`role !== null && role !== "guest"`).
 */
export function SwitchyFunnelSection({ projectId, funnelId, funnelName, funnel }: Props) {
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
          <span className="text-sm font-semibold">
            {funnel ? "Links da campanha" : "Switch — Gerador de Links"}
          </span>
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
          {funnel && (
            <SwitchyLinksTab projectId={projectId} funnelId={funnelId} funnel={funnel} />
          )}
        </div>
      )}
    </div>
  );
}
