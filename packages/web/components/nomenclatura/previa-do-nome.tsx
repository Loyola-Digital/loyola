"use client";

/**
 * Story 47.3 — a prévia do nome (spec § 7): mono, dez campos coloridos por
 * bloco (identidade / ano / segmentação), `_` em cinza, `…` no que falta,
 * a constante `perpetuo` já preenchida (Story 47.8),
 * contador e botão Copiar. A string vem de `buildCampaignName` (pela
 * `previaDoNome`), nunca de template string.
 */

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CLASSE_DO_BLOCO, LEGENDA_DOS_BLOCOS, type Previa } from "@/lib/utils/nomenclatura-gerador";
import { cn } from "@/lib/utils";

export async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Nome copiado.");
  } catch {
    toast.error("Não consegui copiar — selecione e copie à mão.");
  }
}

export function PreviaDoNome({ previa, compacta = false }: { previa: Previa; compacta?: boolean }) {
  return (
    <div className="space-y-2">
      {!compacta ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {LEGENDA_DOS_BLOCOS.map((l) => (
            <span key={l.bloco} title={l.descricao}>
              <span className={cn("font-semibold", CLASSE_DO_BLOCO[l.bloco])}>■</span> {l.rotulo}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-base" aria-label="prévia do nome">
          {previa.pedacos.map((p, i) => (
            <span key={p.campo}>
              {i > 0 ? <span className="text-muted-foreground">_</span> : null}
              <span className={p.faltando ? "text-muted-foreground" : CLASSE_DO_BLOCO[p.bloco]} title={p.campo}>
                {p.faltando ? "…" : p.valor}
              </span>
            </span>
          ))}
        </code>
        <Button type="button" variant="outline" size="sm" disabled={!previa.nome} onClick={() => previa.nome && void copiarTexto(previa.nome)}>
          <Copy className="mr-1 h-4 w-4" /> Copiar nome
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {previa.nome ? `${previa.tamanho} caracteres` : previa.erro ? <span className="text-destructive">{previa.erro}</span> : "Preencha os campos para liberar o nome."}
      </p>
    </div>
  );
}
