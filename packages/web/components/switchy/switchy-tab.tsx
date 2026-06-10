"use client";

import { Link2 } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { SwitchyConfigPanel } from "./switchy-config-panel";
import { SwitchyPresetsManager } from "./switchy-presets-manager";
import { SwitchyGenerator } from "./switchy-generator";
import { SwitchyHistoryList } from "./switchy-history-list";

interface Props {
  projectId: string;
}

/**
 * Aba "Switch" a nível de projeto (Epic 33). Hospeda config de pixels +
 * presets manager (Story 33.4) e o gerador em lote + histórico (Story 33.5).
 *
 * Distinto de components/funnels/switchy-links-tab.tsx, que é nível etapa e
 * read-only (lista links/cliques) — esse fica intacto.
 *
 * Gating binário: leitura liberada; escrita (settings/presets/generate) só
 * para não-guest (`role !== null && role !== "guest"`).
 */
export function SwitchyTab({ projectId }: Props) {
  const role = useUserRole();
  const canEdit = role !== null && role !== "guest";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Switch — Gerador de Links
        </h1>
      </div>

      <SwitchyGenerator projectId={projectId} canEdit={canEdit} />

      <div className="grid grid-cols-1 gap-6">
        <SwitchyConfigPanel projectId={projectId} canEdit={canEdit} />
        <SwitchyPresetsManager projectId={projectId} canEdit={canEdit} />
      </div>

      <SwitchyHistoryList projectId={projectId} />
    </div>
  );
}
