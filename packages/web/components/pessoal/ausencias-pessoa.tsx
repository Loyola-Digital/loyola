"use client";

/**
 * Férias e ausências de uma pessoa.
 *
 * O saldo aparece com as PARCELAS à vista (direito, gozados, ajuste), não só o
 * total: nenhum cálculo automático cobre acordo, venda de dias ou período
 * anterior ao sistema, e um número que ninguém consegue conferir é um número em
 * que ninguém confia.
 */

import { useState } from "react";
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataBr } from "@/components/pessoal/ficha-pessoa";
import {
  useAtualizarAusencia,
  useCriarAusencia,
  useRemoverAusencia,
  type Ausencia,
  type EntradaDeAusencia,
  type SaldoDeFerias,
  type StatusDeAusencia,
  type TipoDeAusencia,
} from "@/lib/hooks/use-pessoal";

const TIPOS: { valor: TipoDeAusencia; rotulo: string }[] = [
  { valor: "ferias", rotulo: "Férias" },
  { valor: "folga", rotulo: "Folga" },
  { valor: "ausencia", rotulo: "Ausência" },
  { valor: "licenca", rotulo: "Licença" },
];

const STATUS: { valor: StatusDeAusencia; rotulo: string }[] = [
  { valor: "programada", rotulo: "Programada" },
  { valor: "aprovada", rotulo: "Aprovada" },
  { valor: "concluida", rotulo: "Concluída" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

const COR_DO_STATUS: Record<StatusDeAusencia, string> = {
  programada: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  aprovada: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  concluida: "border-border text-muted-foreground",
  cancelada: "border-border text-muted-foreground line-through",
};

const hojeIso = () => new Date().toISOString().slice(0, 10);

function Formulario({
  inicial,
  pessoas,
  onCancelar,
  onGravar,
  gravando,
}: {
  inicial?: Ausencia;
  pessoas: { userId: string; nome: string }[];
  onCancelar: () => void;
  onGravar: (dados: EntradaDeAusencia) => void;
  gravando: boolean;
}) {
  const [kind, setKind] = useState<TipoDeAusencia>(inicial?.kind ?? "ferias");
  const [status, setStatus] = useState<StatusDeAusencia>(inicial?.status ?? "programada");
  const [inicio, setInicio] = useState(inicial?.inicio ?? hojeIso());
  const [fim, setFim] = useState(inicial?.fim ?? hojeIso());
  const [cobertura, setCobertura] = useState(inicial?.coberturaUserId ?? "");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");

  const invertido = fim < inicio;

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Tipo</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as TipoDeAusencia)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusDeAusencia)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS.map((s) => (
                <SelectItem key={s.valor} value={s.valor}>
                  {s.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Início</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Fim</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Cobertura</Label>
          <Select value={cobertura || "ninguem"} onValueChange={(v) => setCobertura(v === "ninguem" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Ninguém" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguem">Ninguém</SelectItem>
              {pessoas.map((p) => (
                <SelectItem key={p.userId} value={p.userId}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Observação</Label>
          <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {invertido && (
        <p className="text-[11px] text-destructive">O fim não pode ser antes do início.</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={invertido || gravando}
          onClick={() =>
            onGravar({
              kind,
              status,
              inicio,
              fim,
              coberturaUserId: cobertura || null,
              observacao: observacao || null,
            })
          }
        >
          {gravando && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {inicial ? "Salvar" : "Adicionar"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function AusenciasPessoa({
  userId,
  ausencias,
  saldo,
  pessoas,
  editavel,
}: {
  userId: string;
  ausencias: Ausencia[];
  saldo: SaldoDeFerias;
  pessoas: { userId: string; nome: string }[];
  editavel: boolean;
}) {
  const criar = useCriarAusencia(userId);
  const atualizar = useAtualizarAusencia();
  const remover = useRemoverAusencia();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const hoje = hojeIso();
  const nomeDe = (id: string | null) => pessoas.find((p) => p.userId === id)?.nome ?? null;

  const proximas = ausencias.filter((a) => a.fim >= hoje && a.status !== "cancelada");
  const passadas = ausencias.filter((a) => a.fim < hoje || a.status === "cancelada");

  function Linha({ a }: { a: Ausencia }) {
    if (editando === a.id) {
      return (
        <Formulario
          inicial={a}
          pessoas={pessoas.filter((p) => p.userId !== userId)}
          gravando={atualizar.isPending}
          onCancelar={() => setEditando(null)}
          onGravar={(dados) =>
            atualizar.mutate(
              { id: a.id, dados },
              {
                onSuccess: () => {
                  toast.success("Período atualizado");
                  setEditando(null);
                },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
              },
            )
          }
        />
      );
    }
    const emCurso = a.inicio <= hoje && a.fim >= hoje && a.status !== "cancelada";
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 px-3 py-2">
        <Badge variant="outline" className={`shrink-0 text-[10px] ${COR_DO_STATUS[a.status]}`}>
          {STATUS.find((s) => s.valor === a.status)?.rotulo}
        </Badge>
        <span className="text-sm font-medium">
          {TIPOS.find((t) => t.valor === a.kind)?.rotulo}
        </span>
        <span className="text-sm text-muted-foreground">
          {dataBr(a.inicio)} → {dataBr(a.fim)} · {a.dias} {a.dias === 1 ? "dia" : "dias"}
        </span>
        {emCurso && (
          <Badge className="shrink-0 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400">
            em curso
          </Badge>
        )}
        {nomeDe(a.coberturaUserId) && (
          <span className="text-[11px] text-muted-foreground">
            cobertura: {nomeDe(a.coberturaUserId)}
          </span>
        )}
        {a.observacao && (
          <span className="truncate text-[11px] text-muted-foreground">· {a.observacao}</span>
        )}
        {editavel && (
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditando(a.id)} aria-label="Editar">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              aria-label="Remover"
              onClick={() =>
                remover.mutate(a.id, {
                  onSuccess: () => toast.success("Período removido"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
                })
              }
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Saldo, com as parcelas à mostra */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { rotulo: "Dias disponíveis", valor: saldo.disponivel, destaque: true },
          { rotulo: "Direito acumulado", valor: saldo.direito },
          { rotulo: "Já gozados", valor: saldo.gozados },
          { rotulo: "Ajuste manual", valor: saldo.ajuste },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-border/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.rotulo}</p>
            <p className={`font-mono text-lg tabular-nums ${c.destaque ? "font-bold" : ""}`}>
              {c.valor > 0 && c.rotulo === "Ajuste manual" ? "+" : ""}
              {c.valor}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        30 dias por período aquisitivo completo ({saldo.periodos}{" "}
        {saldo.periodos === 1 ? "período" : "períodos"}), menos os aprovados e concluídos. Acordo,
        venda de dias ou férias anteriores ao sistema entram pelo ajuste manual.
      </p>

      {editavel && !novo && (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setNovo(true)}>
          <Plus className="h-3 w-3" />
          Novo período
        </Button>
      )}
      {novo && (
        <Formulario
          pessoas={pessoas.filter((p) => p.userId !== userId)}
          gravando={criar.isPending}
          onCancelar={() => setNovo(false)}
          onGravar={(dados) =>
            criar.mutate(dados, {
              onSuccess: () => {
                toast.success("Período registrado");
                setNovo(false);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao registrar"),
            })
          }
        />
      )}

      {ausencias.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <CalendarDays className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum período registrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proximas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Programado
              </p>
              {proximas.map((a) => (
                <Linha key={a.id} a={a} />
              ))}
            </div>
          )}
          {passadas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Histórico
              </p>
              {passadas.map((a) => (
                <Linha key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
