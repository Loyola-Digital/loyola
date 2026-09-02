"use client";

/**
 * As agendas do Google que o Planner lê.
 *
 * ## Por que é preciso digitar o ID
 *
 * Uma service account não tem caixa de entrada, então nunca aceita o convite de
 * compartilhamento — e a lista de agendas dela fica permanentemente vazia. A
 * permissão, essa, vale desde o momento em que o e-mail é adicionado. O que
 * falta é saber QUAL agenda ler, e isso só quem configura sabe.
 *
 * Por isso o e-mail aparece aqui, pronto para copiar: o passo que trava é
 * justamente achá-lo.
 */

import { useState } from "react";
import { Check, Copy, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAgendasDoGoogle,
  useConectarAgenda,
  useDesconectarAgenda,
  useImportarAgenda,
} from "@/lib/hooks/use-planner";

export function AgendasDoGoogle({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useAgendasDoGoogle(open);
  const conectar = useConectarAgenda();
  const desconectar = useDesconectarAgenda();
  const importar = useImportarAgenda();

  const [novoId, setNovoId] = useState("");
  const [copiado, setCopiado] = useState(false);

  const email = data?.emailParaCompartilhar ?? "";

  async function adicionar() {
    if (!novoId.trim()) return;
    try {
      const a = await conectar.mutateAsync(novoId.trim());
      setNovoId("");
      toast.success(`"${a.label}" conectada`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui abrir a agenda");
    }
  }

  async function trazer(calendarId: string, label: string) {
    try {
      const r = await importar.mutateAsync({ calendarId });
      toast.success(
        `${label}: ${r.fases} fase(s) em ${r.campanhasCriadas + r.campanhasAtualizadas} campanha(s)`,
        {
          description:
            r.ignoradosPorTerHora > 0
              ? `${r.ignoradosPorTerHora} evento(s) com hora marcada ficaram de fora — são reuniões, não fases.`
              : undefined,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui importar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Agenda do Google</DialogTitle>
          <DialogDescription>
            Traz os eventos de dia inteiro como fases. O título vira campanha e fase pelo padrão{" "}
            <code className="text-[11px]">CAMPANHA - Fase</code> ou{" "}
            <code className="text-[11px]">[CAMPANHA] Fase</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium">1. Compartilhe a agenda com este e-mail</p>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">
                {email || "—"}
              </code>
              <button
                type="button"
                disabled={!email}
                onClick={async () => {
                  await navigator.clipboard.writeText(email);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                }}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copiar"
              >
                {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              No Google Calendar: <strong>Configurações e compartilhamento</strong> →{" "}
              <strong>Compartilhar com pessoas e grupos</strong>. O convite por e-mail não precisa
              ser aceito — a permissão vale na hora.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="id-agenda" className="text-[11px] font-medium">
              2. Cole o ID da agenda
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Na mesma tela, em <strong>Integrar agenda</strong> → <strong>ID da agenda</strong>.
            </p>
            <div className="flex gap-1.5">
              <Input
                id="id-agenda"
                value={novoId}
                onChange={(e) => setNovoId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionar()}
                placeholder="c_abc123…@group.calendar.google.com"
                className="h-9 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={adicionar}
                disabled={!novoId.trim() || conectar.isPending}
                className="shrink-0 rounded-md border border-foreground bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-40"
              >
                {conectar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Conectar"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium">Agendas conectadas</p>
            {isLoading ? (
              <p className="text-[11px] text-muted-foreground">Carregando…</p>
            ) : (data?.agendas ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                Nenhuma ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(data?.agendas ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">{a.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {a.lastImportedAt
                          ? `importada ${new Date(a.lastImportedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                          : "nunca importada"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => trazer(a.calendarId, a.label)}
                      disabled={importar.isPending}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
                    >
                      {importar.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      Importar
                    </button>

                    <button
                      type="button"
                      onClick={() => desconectar.mutate(a.id)}
                      title="Desconectar"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* O que a importação NÃO faz precisa estar visível antes, não
              descoberto depois de uma fase sumir. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Reimportar <strong>atualiza</strong> as fases que vieram do Google e não toca nas que
            você criou aqui. Eventos com hora marcada ficam de fora — são reuniões, não fases.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
