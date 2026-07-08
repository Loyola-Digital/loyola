"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, ScrollText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useFunnel } from "@/lib/hooks/use-funnels";
import {
  useCampaignLog,
  useDeleteLogEntry,
  type CampaignLogEntry,
} from "@/lib/hooks/use-campaign-log";
import {
  LOG_EVENTOS,
  LOG_APLICATIVOS,
  LOG_CATEGORIAS,
  eventoBadgeClass,
} from "@/lib/campaign-log-options";
import { CampaignLogEntryDialog } from "@/components/funnels/campaign-log-entry-dialog";

// Epic 38 / Story 38.1 — página do Log de Campanha do funil: timeline das
// ações executadas (agrupada por dia) + lançamento rápido + filtros.

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
  const base = `${d} ${MONTHS[m - 1]} · ${WEEKDAYS[date.getDay()]}`;
  if (dateKey === todayKey) return `Hoje · ${base}`;
  if (dateKey === yesterdayKey) return `Ontem · ${base}`;
  return base;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function CampaignLogPage() {
  const params = useParams<{ id: string; funnelId: string }>();

  const [days, setDays] = useState(90);
  const [evento, setEvento] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  // Debounce da busca: sem isso, cada tecla dispara um request (queryKey muda).
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CampaignLogEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: funnelData } = useFunnel(params.id, params.funnelId);
  const { data, isLoading } = useCampaignLog(params.id, params.funnelId, {
    days,
    evento: evento || undefined,
    aplicativo: aplicativo || undefined,
    categoria: categoria || undefined,
    q: qDebounced || undefined,
  });
  const deleteEntry = useDeleteLogEntry(params.id, params.funnelId);

  const entries = useMemo(() => data?.entries ?? [], [data]);

  // Agrupa por dia local (mais recente primeiro — a API já ordena desc).
  const byDay = useMemo(() => {
    const groups = new Map<string, CampaignLogEntry[]>();
    const pad = (n: number) => String(n).padStart(2, "0");
    for (const e of entries) {
      const d = new Date(e.occurredAt);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [entries]);

  const hasFilters = !!(evento || aplicativo || categoria || qDebounced);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteEntry.mutateAsync(confirmDeleteId);
      toast.success("Registro removido");
      setConfirmDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
            <Link href={`/projects/${params.id}/funnels/${params.funnelId}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {funnelData?.funnel.name ?? "Funil"}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-indigo-500" />
            <h1 className="text-2xl font-bold">Log de Campanha</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Tudo que foi feito na campanha — disparos, publicações, ajustes de tráfego e automações.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditingEntry(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          Registrar ação
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <DayRangePicker days={days} onDaysChange={setDays} />
        <Select value={evento || "all"} onValueChange={(v) => setEvento(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue placeholder="Evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {LOG_EVENTOS.filter((e) => e !== "Outro").map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={aplicativo || "all"} onValueChange={(v) => setAplicativo(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Aplicativo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os apps</SelectItem>
            {LOG_APLICATIVOS.filter((a) => a !== "Outro").map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {LOG_CATEGORIAS.filter((c) => c !== "Outro").map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nas observações..."
            className="h-8 w-[220px] pl-7 text-xs"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "ação" : "ações"} no período
        </span>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : byDay.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-2">
          <ScrollText className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "Nenhuma ação encontrada com esses filtros."
              : "Nenhuma ação registrada ainda nesta campanha."}
          </p>
          {!hasFilters && (
            <Button className="mt-2 gap-1.5" onClick={() => { setEditingEntry(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Registrar primeira ação
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {byDay.map(([dateKey, dayEntries]) => (
            <div key={dateKey} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {dayLabel(dateKey)}
                <span className="ml-2 font-normal normal-case">
                  {dayEntries.length} {dayEntries.length === 1 ? "ação" : "ações"}
                </span>
              </h3>
              <div className="space-y-1.5">
                {dayEntries.map((e) => {
                  const hora = new Date(e.occurredAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const who = e.responsavel || e.authorName || "—";
                  return (
                    <div
                      key={e.id}
                      className="group flex items-start gap-3 rounded-lg border border-border/40 bg-card/60 px-3 py-2.5"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {hora}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${eventoBadgeClass(e.evento)}`}>
                            {e.evento}
                          </span>
                          {e.categoria && (
                            <span className="inline-flex items-center rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {e.categoria}
                            </span>
                          )}
                          {e.aplicativo && (
                            <span className="text-[11px] text-muted-foreground">via {e.aplicativo}</span>
                          )}
                        </div>
                        {e.notes && <p className="mt-1 text-sm">{e.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={`Registrado por ${e.authorName ?? "—"}`}>
                          <Avatar className="h-5 w-5">
                            {e.authorAvatarUrl && (
                              <AvatarImage src={e.authorAvatarUrl} alt={who} />
                            )}
                            <AvatarFallback className="text-[9px]">{initials(who)}</AvatarFallback>
                          </Avatar>
                          <span className="hidden sm:inline max-w-[120px] truncate">{who}</span>
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingEntry(e); setDialogOpen(true); }}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setConfirmDeleteId(e.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <CampaignLogEntryDialog
        projectId={params.id}
        funnelId={params.funnelId}
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingEntry(null); }}
        editingEntry={editingEntry}
      />

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido permanentemente do log da campanha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEntry.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
