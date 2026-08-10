"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
// Subpath direto, e não o índice do pacote: o índice reexporta tipos com
// imports NodeNext (`./types/funnel.js`) que o webpack do Next não resolve —
// ver o cabeçalho de `contract.ts`.
import { API_CONTRACT_VERSION } from "@loyola-x/shared/src/contract";
import { useApiHealth } from "@/lib/hooks/use-api-health";
import { compareApiContract } from "@/lib/utils/api-contract";

/**
 * Story 29.46 — avisa quando painel e API não estão na mesma versão.
 *
 * Client component porque `(app)/layout.tsx` é Server Component e não pode
 * chamar hook — mesmo arranjo que `Topbar` e `UserStatusGuard` já usam.
 *
 * Fica no layout, e não em cada tela, porque o problema é global: a defasagem
 * afeta todo recurso novo ao mesmo tempo. As três ocorrências registradas
 * (18.60, 29.43, 29.45) apareceram em telas diferentes e tinham a mesma causa.
 */
export function ApiContractBanner() {
  const { data } = useApiHealth();
  const [dispensado, setDispensado] = useState(false);

  const veredicto = compareApiContract(data?.contract, API_CONTRACT_VERSION);
  if (veredicto.kind === "alinhado" || dispensado) return null;

  const apiAtras = veredicto.kind === "api-atras";
  const commit = data?.commit;

  return (
    <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 md:px-6">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-[12px]">
        <p className="font-medium text-amber-700 dark:text-amber-400">
          {apiAtras
            ? "A API está numa versão anterior à do painel."
            : "O painel está numa versão anterior à da API."}
        </p>
        <p className="text-muted-foreground">
          {apiAtras
            ? "Recursos novos podem não aparecer ou aparecer incompletos. Avise o time — um deploy da API resolve."
            : "O deploy do painel está pendente. Alguns dados podem vir em formato mais novo do que esta tela espera."}
          {" "}
          <span className="tabular-nums">
            (contrato {veredicto.api} · painel {veredicto.web}
            {commit ? ` · API ${commit}` : ""})
          </span>
        </p>
      </div>
      {/* Dispensável: o gestor não resolve deploy, e um aviso que ele não pode
          fechar vira ruído permanente na tela em que ele trabalha o dia todo. */}
      <button
        type="button"
        onClick={() => setDispensado(true)}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-amber-500/10 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
