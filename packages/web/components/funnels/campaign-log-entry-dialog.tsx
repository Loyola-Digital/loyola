"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateLogEntry,
  useUpdateLogEntry,
  type CampaignLogEntry,
} from "@/lib/hooks/use-campaign-log";
import {
  LOG_EVENTOS,
  LOG_APLICATIVOS,
  LOG_CATEGORIAS,
} from "@/lib/campaign-log-options";
import { cn } from "@/lib/utils";

// Epic 38 / Story 38.1 — dialog de lançamento rápido do Log de Campanha.
// Meta: registrar uma ação em < 10s. Data/hora default = agora; responsável
// default = usuário logado (só preenche se foi outra pessoa); "continuar
// lançando" mantém o dialog aberto pra registrar várias ações em sequência.

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return nowLocalInput();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Select com busca (30+ opções): Popover + input de filtro + lista. */
function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : [...options];
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mb-1 h-8"
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma opção</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt === value ? "" : opt); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", opt === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{opt}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface CampaignLogEntryDialogProps {
  projectId: string;
  funnelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando passado, dialog entra em modo edição (PATCH). */
  editingEntry?: CampaignLogEntry | null;
}

export function CampaignLogEntryDialog({
  projectId,
  funnelId,
  open,
  onOpenChange,
  editingEntry,
}: CampaignLogEntryDialogProps) {
  const isEditing = !!editingEntry;
  const { user } = useUser();
  const create = useCreateLogEntry(projectId, funnelId);
  const update = useUpdateLogEntry(projectId, funnelId);

  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [evento, setEvento] = useState("");
  const [eventoOutro, setEventoOutro] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [aplicativoOutro, setAplicativoOutro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriaOutro, setCategoriaOutro] = useState("");
  const [notes, setNotes] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingEntry) {
      setOccurredAt(isoToLocalInput(editingEntry.occurredAt));
      const ev = editingEntry.evento;
      if ((LOG_EVENTOS as readonly string[]).includes(ev)) { setEvento(ev); setEventoOutro(""); }
      else { setEvento("Outro"); setEventoOutro(ev); }
      const ap = editingEntry.aplicativo ?? "";
      if (!ap || (LOG_APLICATIVOS as readonly string[]).includes(ap)) { setAplicativo(ap); setAplicativoOutro(""); }
      else { setAplicativo("Outro"); setAplicativoOutro(ap); }
      const cat = editingEntry.categoria ?? "";
      if (!cat || (LOG_CATEGORIAS as readonly string[]).includes(cat)) { setCategoria(cat); setCategoriaOutro(""); }
      else { setCategoria("Outro"); setCategoriaOutro(cat); }
      setNotes(editingEntry.notes ?? "");
      setResponsavel(editingEntry.responsavel ?? "");
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEntry?.id]);

  function resetForm() {
    setOccurredAt(nowLocalInput());
    setEvento("");
    setEventoOutro("");
    setAplicativo("");
    setAplicativoOutro("");
    setCategoria("");
    setCategoriaOutro("");
    setNotes("");
    setResponsavel("");
  }

  function resolveOutro(value: string, outro: string): string | null {
    if (!value) return null;
    if (value === "Outro") return outro.trim() || null;
    return value;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const eventoFinal = resolveOutro(evento, eventoOutro);
    if (!eventoFinal) {
      toast.error("Selecione o evento (ou descreva em Outro)");
      return;
    }
    if (!occurredAt) {
      toast.error("Informe a data/hora da ação");
      return;
    }

    const input = {
      occurredAt,
      evento: eventoFinal,
      aplicativo: resolveOutro(aplicativo, aplicativoOutro),
      categoria: resolveOutro(categoria, categoriaOutro),
      notes: notes.trim() || null,
      responsavel: responsavel.trim() || null,
    };

    try {
      if (isEditing && editingEntry) {
        await update.mutateAsync({ entryId: editingEntry.id, input });
        toast.success("Ação atualizada");
        onOpenChange(false);
      } else {
        await create.mutateAsync(input);
        toast.success("Ação registrada");
        if (keepOpen) {
          // Mantém evento/aplicativo/categoria (sequência de disparos costuma
          // repetir o contexto) — renova só hora e observação.
          setOccurredAt(nowLocalInput());
          setNotes("");
        } else {
          resetForm();
          onOpenChange(false);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) resetForm(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar ação" : "Registrar ação"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Ajuste os campos e salve."
                : "O que foi feito na campanha? Data/hora já vem preenchida com agora."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="log-occurred-at">Data e hora *</Label>
            <Input
              id="log-occurred-at"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="log-evento">Evento *</Label>
            <Select value={evento} onValueChange={setEvento}>
              <SelectTrigger id="log-evento">
                <SelectValue placeholder="O que foi feito?" />
              </SelectTrigger>
              <SelectContent>
                {LOG_EVENTOS.map((ev) => (
                  <SelectItem key={ev} value={ev}>{ev}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {evento === "Outro" && (
              <Input
                value={eventoOutro}
                onChange={(e) => setEventoOutro(e.target.value)}
                placeholder="Descreva o evento"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="log-aplicativo">Aplicativo</Label>
              <SearchSelect
                id="log-aplicativo"
                value={aplicativo}
                onChange={setAplicativo}
                options={LOG_APLICATIVOS}
                placeholder="Ferramenta usada"
              />
              {aplicativo === "Outro" && (
                <Input
                  value={aplicativoOutro}
                  onChange={(e) => setAplicativoOutro(e.target.value)}
                  placeholder="Qual aplicativo?"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-categoria">Categoria</Label>
              <SearchSelect
                id="log-categoria"
                value={categoria}
                onChange={setCategoria}
                options={LOG_CATEGORIAS}
                placeholder="Detalhe da ação"
              />
              {categoria === "Outro" && (
                <Input
                  value={categoriaOutro}
                  onChange={(e) => setCategoriaOutro(e.target.value)}
                  placeholder="Qual categoria?"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="log-notes">Observações (ou título da mensagem)</Label>
            <Input
              id="log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: E-mail 'Últimas vagas' pra lista quente"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="log-responsavel">Responsável</Label>
            <Input
              id="log-responsavel"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder={`padrão: você${user?.fullName ? ` (${user.fullName})` : ""}`}
            />
            <p className="text-[10px] text-muted-foreground">
              Deixe vazio pra registrar no seu nome — preencha só se a ação foi de outra pessoa.
            </p>
          </div>

          <DialogFooter className="items-center gap-3 sm:justify-between">
            {!isEditing ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Continuar lançando
              </label>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : isEditing ? "Salvar" : "Registrar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
