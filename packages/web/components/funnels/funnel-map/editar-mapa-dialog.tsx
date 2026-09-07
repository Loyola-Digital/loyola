"use client";

/**
 * Editar um mapa avulso: nome, dono e a saída.
 *
 * ## Por que tudo numa tela só
 *
 * Renomear, atribuir a uma empresa, prender a um funil e excluir são coisas
 * que se faz na mesma visita — quem abre para corrigir o nome costuma ser
 * quem percebeu que o mapa está na empresa errada. Espalhar isso em quatro
 * lugares faria procurar.
 *
 * ## Vincular é de mão única
 *
 * Prender o mapa a um funil cria a etapa `mapa` lá dentro, e a partir daí ele
 * passa a ser editado pelo caminho do funil. Não há desvincular: seria preciso
 * decidir o que fazer com a etapa criada, e "some do funil sem avisar ninguém"
 * é a pior das respostas. O aviso na tela diz isso antes.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Link2, Loader2, Trash2 } from "lucide-react";
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
import {
  useAtualizarMapa,
  useDuplicarMapa,
  useExcluirMapaAvulso,
  useVincularMapa,
  type MapaNaLista,
} from "@/lib/hooks/use-funnel-maps-global";
import { useProjects } from "@/lib/hooks/use-projects";
import { useFunnels } from "@/lib/hooks/use-funnels";

export function EditarMapaDialog({
  mapa,
  onOpenChange,
}: {
  /** `null` fecha. O mapa vem inteiro para o formulário nascer preenchido. */
  mapa: MapaNaLista | null;
  onOpenChange: (v: boolean) => void;
}) {
  const atualizar = useAtualizarMapa();
  const vincular = useVincularMapa();
  const excluir = useExcluirMapaAvulso();
  const duplicar = useDuplicarMapa();
  const { data: empresas } = useProjects();

  const [nome, setNome] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [funilId, setFunilId] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const { data: funis } = useFunnels(empresaId || null);

  // Recarrega ao trocar de mapa: sem isto o formulário mostraria os dados do
  // que foi aberto antes.
  useEffect(() => {
    setNome(mapa?.stageName ?? "");
    setEmpresaId(mapa?.projectId ?? "");
    setFunilId("");
    setConfirmando(false);
  }, [mapa]);

  if (!mapa?.mapId) return null;
  const id = mapa.mapId;
  const ocupado = atualizar.isPending || vincular.isPending || excluir.isPending;

  async function salvar() {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      await atualizar.mutateAsync({ id, name: limpo, projectId: empresaId || null });
      toast.success("Mapa salvo");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    }
  }

  async function prender() {
    if (!funilId) return;
    try {
      await vincular.mutateAsync({ id, funnelId: funilId });
      toast.success("Mapa vinculado ao funil", {
        description: "A partir de agora ele aparece na lista de etapas dele.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui vincular");
    }
  }

  return (
    <Dialog open={!!mapa} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Editar mapa</DialogTitle>
          <DialogDescription>
            {mapa.blocos} bloco(s) em {mapa.abas} aba(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editar-nome" className="text-[11px] font-medium">
              Nome
            </Label>
            <Input
              id="editar-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void salvar()}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editar-empresa" className="text-[11px] font-medium">
              Empresa
            </Label>
            <select
              id="editar-empresa"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                // O funil escolhido é de outra empresa a partir daqui.
                setFunilId("");
              }}
              disabled={ocupado}
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

          <div className="flex items-center justify-between gap-2">
            {/*
              Duplicar fica junto de Salvar, e não na zona de perigo: é um
              gesto seguro — a cópia nasce à parte e o original não é tocado.
            */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={ocupado || duplicar.isPending}
              onClick={() =>
                duplicar
                  .mutateAsync({ id })
                  .then((c) =>
                    toast.success(`“${c.name}” criada`, {
                      // A cópia sai da etapa e vira mapa avulso: sem dizer
                      // isso, a pessoa a procura dentro do funil e não acha.
                      description: "A cópia é um mapa avulso — está na lista de mapas.",
                      duration: 8000,
                    }),
                  )
                  .then(() => onOpenChange(false))
                  .catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Não consegui duplicar"),
                  )
              }
            >
              {duplicar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Duplicar
            </Button>

            <Button size="sm" onClick={salvar} disabled={!nome.trim() || ocupado}>
              {atualizar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium">
              <Link2 className="h-3.5 w-3.5" />
              Prender a um funil
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              O mapa vira uma etapa do funil e passa a ser editado por lá. Não dá para desfazer
              pela tela.
            </p>
            <div className="flex gap-1.5 pt-1">
              <select
                value={funilId}
                onChange={(e) => setFunilId(e.target.value)}
                disabled={!empresaId || ocupado}
                aria-label="Funil"
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[12px] disabled:opacity-50"
              >
                <option value="">{empresaId ? "Escolha o funil…" : "escolha a empresa antes"}</option>
                {(funis ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={prender}
                disabled={!funilId || ocupado}
              >
                {vincular.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Vincular"
                )}
              </Button>
            </div>
          </div>

          {/* Zona de perigo: separada, vermelha e com confirmação no lugar —
              não num diálogo por cima do diálogo, que empilha modal e esconde
              o que está sendo apagado. */}
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Zona de perigo
            </p>
            {confirmando ? (
              <>
                <p className="text-[11px] leading-relaxed text-destructive">
                  O desenho vai embora com {mapa.blocos} bloco(s). Não dá para desfazer.
                </p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setConfirmando(false)}
                    disabled={ocupado}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8"
                    onClick={() => {
                      excluir.mutate(id, {
                        onSuccess: () => {
                          toast.success(`"${mapa.stageName}" excluído`);
                          onOpenChange(false);
                        },
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Não consegui excluir"),
                      });
                    }}
                    disabled={ocupado}
                  >
                    {excluir.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Excluir de vez"
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmando(true)}
                disabled={ocupado}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Excluir mapa
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
