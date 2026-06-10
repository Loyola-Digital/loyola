"use client";

import { Link2 } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { SwitchyConfigPanel } from "./switchy-config-panel";
import { SwitchyPresetsManager } from "./switchy-presets-manager";

interface Props {
  projectId: string;
}

/**
 * Aba "Switch" a nível de projeto (Epic 33). CONFIG-ONLY desde a Story 33.7:
 * hospeda só a config de pixels (seletor dos pixels da conta Switchy) + presets
 * manager. O gerador em lote + histórico vivem agora DENTRO da página do funil
 * (components/funnels/switchy-funnel-section.tsx), atrelados ao funnelId.
 *
 * Distinto de components/funnels/switchy-links-tab.tsx, que é nível etapa e
 * read-only (lista links/cliques) — esse fica intacto.
 *
 * Gating binário: leitura liberada; escrita (settings/presets) só para não-guest
 * (`role !== null && role !== "guest"`).
 */
export function SwitchyTab({ projectId }: Props) {
  const role = useUserRole();
  const canEdit = role !== null && role !== "guest";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Switch — Configuração
        </h1>
        <p className="text-xs text-muted-foreground">
          Gere links dentro de cada funil. Aqui ficam só pixels e canais.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <SwitchyConfigPanel projectId={projectId} canEdit={canEdit} />
        <SwitchyPresetsManager projectId={projectId} canEdit={canEdit} />
      </div>
    </div>
  );
}
