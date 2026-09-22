"use client";

/**
 * Até onde um convidado enxerga: empresa, e dentro dela um funil e uma etapa.
 *
 * Existe para o vendedor contratado — ele cria a conta e aqui alguém escolhe
 * "BBE, funil bbe-pr2-ago-26, etapa Evento". Antes, a única forma de dar acesso
 * era o link de convite, que entregava a empresa inteira.
 *
 * Salvar marca a pessoa como CONVIDADO e ativa a conta: são as três coisas que
 * aconteciam juntas no aceite do convite, e separá-las aqui deixaria a conta
 * aprovada sem escopo (ou com escopo e sem entrar).
 */

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAcessoDoUsuario, useDefinirAcesso } from "@/lib/hooks/use-admin-users";
import { useProjects } from "@/lib/hooks/use-projects";
import { useFunnels } from "@/lib/hooks/use-funnels";
import { useFunnelStages } from "@/lib/hooks/use-funnel-stages";

/** O Select do Radix não aceita valor vazio; este é o "sem limite". */
const TODOS = "__todos__";

export function AcessoDoConvidado({
  userId,
  nome,
  desabilitado,
}: {
  userId: string;
  nome: string;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [funnelId, setFunnelId] = useState(TODOS);
  const [stageId, setStageId] = useState(TODOS);

  const { data, isLoading } = useAcessoDoUsuario(aberto ? userId : null);
  const projetos = useProjects();
  // Arquivados incluídos: um vendedor pode entrar depois do lançamento acabar.
  const funis = useFunnels(projectId || null, "all");
  const etapas = useFunnelStages(projectId || null, funnelId === TODOS ? null : funnelId);
  const definir = useDefinirAcesso();

  useEffect(() => {
    if (!aberto) return;
    setProjectId(data?.acesso?.projectId ?? "");
    setFunnelId(data?.acesso?.funnelId ?? TODOS);
    setStageId(data?.acesso?.stageId ?? TODOS);
  }, [aberto, data]);

  function salvar() {
    if (!projectId) {
      toast.error("Escolha a empresa.");
      return;
    }
    definir.mutate(
      {
        userId,
        projectId,
        funnelId: funnelId === TODOS ? null : funnelId,
        stageId: stageId === TODOS ? null : stageId,
      },
      {
        onSuccess: () => {
          toast.success(`${nome} agora entra como convidado, só no que você marcou.`);
          setAberto(false);
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Erro ao salvar o acesso."),
      },
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={desabilitado}
        onClick={() => setAberto(true)}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Acesso
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Acesso de {nome}</DialogTitle>
            <DialogDescription>
              Salvar marca como convidado e ativa a conta. Ele vê só o que estiver marcado
              aqui — e nada de outras empresas.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lendo o acesso atual…
            </p>
          ) : (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setFunnelId(TODOS);
                    setStageId(TODOS);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Escolha a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projetos.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-sm">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Funil</Label>
                <Select
                  value={funnelId}
                  disabled={!projectId}
                  onValueChange={(v) => {
                    setFunnelId(v);
                    setStageId(TODOS);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS} className="text-sm">
                      Todos os funis da empresa
                    </SelectItem>
                    {(funis.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id} className="text-sm">
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Etapa</Label>
                <Select value={stageId} disabled={funnelId === TODOS} onValueChange={setStageId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS} className="text-sm">
                      Todas as etapas do funil
                    </SelectItem>
                    {(etapas.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-sm">
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Instagram, conversas e mind ficam fechados para este acesso. Ele continua
                podendo o que o convidado já podia dentro da etapa: marcar status do lead,
                atribuir vendedor e lançar venda manual.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={definir.isPending || isLoading}>
              {definir.isPending ? "Salvando…" : "Salvar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
