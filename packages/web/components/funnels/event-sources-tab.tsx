"use client";

import { useState } from "react";
import { Plus, Trash2, Search, FileSpreadsheet, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import type { SalesPlanSource, SalesPlanSourceInput, SalesPlanSourceRole } from "@loyola-x/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useSpreadsheets, useSpreadsheetSheets, useSheetData,
} from "@/lib/hooks/use-google-sheets";
import { useSalesPlanSources, useSetSalesPlanSources } from "@/lib/hooks/use-sales-plan";

// Story 19.15 — Fontes do evento (aba "Leads do Evento").
// - "participants": planilha MESTRE com todo mundo (nome/email/telefone/tipo).
//   É a lista do Mapa do Evento e do Plano de Vendas.
// - "survey": planilhas de RESPOSTAS (Tally), com faturamento por email. O
//   faturamento é cruzado com a mestre; quem não respondeu fica sem faturamento.

const ROLE_LABEL: Record<SalesPlanSourceRole, string> = {
  participants: "Participantes",
  survey: "Pesquisa",
};

function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function toInput(s: SalesPlanSource): SalesPlanSourceInput {
  return {
    role: s.role,
    tipo: s.tipo,
    spreadsheetId: s.spreadsheetId,
    spreadsheetName: s.spreadsheetName,
    sheetName: s.sheetName,
    mapping: s.mapping,
  };
}

export function EventSourcesTab({ projectId, funnelId, stageId }: { projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading } = useSalesPlanSources(projectId, funnelId, stageId);
  const setSources = useSetSalesPlanSources(projectId, funnelId, stageId);
  const sources = data?.sources ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasMaster = sources.some((s) => s.role === "participants");

  function handleAdd(source: SalesPlanSourceInput) {
    setSources.mutate([...sources.map(toInput), source], {
      onSuccess: () => { toast.success("Planilha conectada"); setDialogOpen(false); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
    });
  }

  function handleRemove(id: string) {
    setSources.mutate(sources.filter((s) => s.id !== id).map(toInput), {
      onSuccess: () => toast.success("Planilha removida"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-muted-foreground space-y-1.5">
          <p>
            Conecte as planilhas do evento (por link do Google Sheets). Há dois papéis:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><strong className="text-foreground">Participantes</strong> — a planilha mestre com <em>todo mundo</em> (nome/email/telefone/tipo). É a lista do Mapa e do Plano.</li>
            <li><strong className="text-foreground">Pesquisa</strong> — as respostas do Tally (email/faturamento). Cruzadas por email; quem não respondeu fica sem faturamento.</li>
          </ul>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Conectar planilha
        </Button>
      </div>

      {!hasMaster && !isLoading && sources.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Conecte uma planilha de <strong>Participantes</strong> (mestre) — sem ela o Mapa e o Plano ficam vazios.
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
          Nenhuma planilha conectada ainda. Clique em <strong>Conectar planilha</strong> e cole o link do
          Google Sheets.
        </div>
      ) : (
        <div className="space-y-1.5">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2 text-sm">
              <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 shrink-0 inline-flex items-center gap-1 ${
                s.role === "participants" ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              }`}>
                {s.role === "participants" ? <Users className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                {ROLE_LABEL[s.role]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{s.spreadsheetName || s.spreadsheetId}</span>
                  <span className="text-muted-foreground">/ {s.sheetName}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.role === "participants"
                    ? `email: ${s.mapping.email || "—"} · nome: ${s.mapping.name || "—"} · telefone: ${s.mapping.telefone || "—"} · tipo: ${s.mapping.tipo || "—"}`
                    : `email: ${s.mapping.email || "—"} · faturamento: ${s.mapping.faturamento || "—"}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.id)}
                disabled={setSources.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConnectSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleAdd}
        saving={setSources.isPending}
      />
    </div>
  );
}

// ============================================================
// Dialog de conexão (planilha → aba → papel + mapeamento)
// ============================================================
type Step = "spreadsheet" | "sheet" | "mapping";

const FIELDS_BY_ROLE: Record<SalesPlanSourceRole, { key: "email" | "name" | "telefone" | "tipo" | "faturamento"; label: string; required?: boolean }[]> = {
  participants: [
    { key: "email", label: "Email", required: true },
    { key: "name", label: "Nome" },
    { key: "telefone", label: "Telefone" },
    { key: "tipo", label: "Tipo (coluna)" },
  ],
  survey: [
    { key: "email", label: "Email", required: true },
    { key: "faturamento", label: "Faturamento", required: true },
  ],
};

function ConnectSourceDialog({
  open, onOpenChange, onConfirm, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (s: SalesPlanSourceInput) => void;
  saving: boolean;
}) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [role, setRole] = useState<SalesPlanSourceRole>("participants");
  const [mapping, setMapping] = useState<{ name?: string; email?: string; telefone?: string; tipo?: string; faturamento?: string }>({});
  const [search, setSearch] = useState("");
  const [link, setLink] = useState("");

  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(selected?.id ?? null);
  const { data: sheetData, isLoading: sheetDataLoading } = useSheetData(selected?.id ?? null, sheet);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : spreadsheets;

  const rawHeaders = sheetData?.headers ?? [];
  // Só colunas com header real — o backend resolve por nome (headers.indexOf).
  const columns = Array.from(new Set(rawHeaders.filter((h) => h && h.trim().length > 0)));

  const step: Step = !selected ? "spreadsheet" : !sheet ? "sheet" : "mapping";
  const fields = FIELDS_BY_ROLE[role];
  const canSave = !!(selected && sheet && mapping.email && (role === "participants" || mapping.faturamento));

  function reset() {
    setSelected(null); setSheet(null); setRole("participants"); setMapping({}); setSearch(""); setLink("");
  }
  function close() { reset(); onOpenChange(false); }

  function useLink() {
    const id = extractSpreadsheetId(link);
    if (!id) { toast.error("Link inválido — cole a URL completa do Google Sheets"); return; }
    setSelected({ id, name: "" });
  }

  function confirm() {
    if (!canSave || !selected || !sheet) return;
    // mantém no mapping só os campos do papel escolhido
    const cleanMapping: { name?: string; email?: string; telefone?: string; tipo?: string; faturamento?: string } = {};
    for (const f of fields) {
      const v = mapping[f.key];
      if (v) cleanMapping[f.key] = v;
    }
    onConfirm({
      role,
      tipo: "",
      spreadsheetId: selected.id,
      spreadsheetName: selected.name,
      sheetName: sheet,
      mapping: cleanMapping,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "spreadsheet" && "Escolher planilha"}
            {step === "sheet" && "Escolher a aba"}
            {step === "mapping" && "Papel + mapeamento de colunas"}
          </DialogTitle>
        </DialogHeader>

        {step === "spreadsheet" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Colar link do Google Sheets</Label>
              <div className="flex gap-2">
                <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => setLink(e.target.value)} />
                <Button type="button" variant="secondary" onClick={useLink} disabled={!link.trim()}>Usar</Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="ou buscar nas suas planilhas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {spreadsheetsLoading ? (
                <><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma planilha encontrada.</p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected({ id: s.id, name: s.name })}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === "sheet" && (
          <div className="space-y-3">
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:underline">← trocar planilha</button>
            {sheetsLoading ? (
              <><Skeleton className="h-9" /><Skeleton className="h-9" /></>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(sheetsData?.sheets ?? []).map((sh) => (
                  <button
                    key={sh.sheetId}
                    type="button"
                    onClick={() => setSheet(sh.title)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm flex items-center justify-between"
                  >
                    <span className="truncate">{sh.title}</span>
                    <span className="text-xs text-muted-foreground">{sh.rowCount} linhas</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-3">
            <button type="button" onClick={() => setSheet(null)} className="text-xs text-muted-foreground hover:underline">← trocar aba</button>

            <div className="space-y-1.5">
              <Label className="text-xs">Papel desta planilha <span className="text-red-500">*</span></Label>
              <Select value={role} onValueChange={(v) => setRole(v as SalesPlanSourceRole)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="participants">Participantes (lista mestre — todo mundo)</SelectItem>
                  <SelectItem value="survey">Pesquisa (respostas — faturamento)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sheetDataLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="space-y-2.5">
                {fields.map((f) => (
                  <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <Label className="text-xs">{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                    <Select
                      value={mapping[f.key] ?? "__none__"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? undefined : v }))}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="selecione a coluna" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={!canSave || saving}>
            {saving ? "Salvando..." : "Conectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
