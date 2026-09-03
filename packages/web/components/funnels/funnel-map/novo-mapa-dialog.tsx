"use client";

/**
 * Criar um mapa a partir da tela Global.
 *
 * ## O caminho que existia
 *
 * Empresa → funil → nova etapa do tipo `mapa` → abrir. Três níveis de
 * navegação antes de existir um desenho — e o primeiro uso de um mapa costuma
 * ser justamente rascunhar um funil que ainda não está montado no sistema.
 *
 * ## O funil é opcional
 *
 * Com funil, o mapa nasce como etapa e aparece na lista de etapas como
 * qualquer outro. Sem, ele existe só aqui — e pode ser vinculado depois, sem
 * perder o desenho.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCriarMapa } from "@/lib/hooks/use-funnel-maps-global";
import { useProjects } from "@/lib/hooks/use-projects";
import { useFunnels } from "@/lib/hooks/use-funnels";

export function NovoMapaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const criar = useCriarMapa();
  const { data: empresas } = useProjects();

  const [nome, setNome] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [funilId, setFunilId] = useState("");

  // Os funis só fazem sentido depois de escolher a empresa; sem ela a lista
  // seria de todos os funis de todos os clientes.
  const { data: funis } = useFunnels(empresaId || null);

  async function gravar() {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      await criar.mutateAsync({
        name: limpo,
        funnelId: funilId || null,
        projectId: empresaId || null,
      });
      toast.success(
        funilId ? `"${limpo}" criado no funil` : `"${limpo}" criado — ainda sem funil`,
      );
      setNome("");
      setEmpresaId("");
      setFunilId("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui criar o mapa");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !criar.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Novo mapa</DialogTitle>
          <DialogDescription>
            O funil é opcional. Sem ele o mapa fica solto aqui — bom para rascunhar antes de o
            funil existir — e dá para vincular depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome-mapa" className="text-[11px] font-medium">
              Nome
            </Label>
            <Input
              id="nome-mapa"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void gravar()}
              placeholder="Mapa do lançamento de junho"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="empresa-mapa" className="text-[11px] font-medium">
                Empresa <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <select
                id="empresa-mapa"
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  // Trocar de empresa invalida o funil escolhido: ele é de
                  // outra, e criar o mapa ali o poria no cliente errado.
                  setFunilId("");
                }}
                disabled={criar.isPending}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
              >
                <option value="">Nenhuma</option>
                {(empresas ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="funil-mapa" className="text-[11px] font-medium">
                Funil <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <select
                id="funil-mapa"
                value={funilId}
                onChange={(e) => setFunilId(e.target.value)}
                disabled={!empresaId || criar.isPending}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px] disabled:opacity-50"
              >
                <option value="">{empresaId ? "Nenhum" : "escolha a empresa"}</option>
                {(funis ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {funilId && (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
              O mapa vai entrar como uma etapa desse funil, e aparece na lista de etapas dele.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={criar.isPending}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={gravar} disabled={!nome.trim() || criar.isPending}>
            {criar.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Criar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
