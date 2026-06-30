"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronRight, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpreadsheets, useSpreadsheetSheets, useSheetData } from "@/lib/hooks/use-google-sheets";
import {
  useNpsDatasets,
  useCreateNpsDataset,
  useDeleteNpsDataset,
  usePatchNpsMapping,
  useNpsCross,
  type NpsDataset,
  type NpsColumnMapping,
  type NpsCrossRow,
} from "@/lib/hooks/use-nps";

// Epic 38 — Aba NPS da etapa. Sobe a lista de NPS (planilha + sheet), mapeia as
// colunas (nome/email/nota/data) e o app cruza por e-mail (fallback nome) com as
// respostas do Loyola da etapa, mostrando quem respondeu, se foi positivo e tudo.

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function NpsStageTab({ projectId, funnelId, stageId }: Props) {
  const datasets = useNpsDatasets(projectId, funnelId, stageId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Seleciona o primeiro dataset por padrão.
  useEffect(() => {
    const list = datasets.data?.datasets ?? [];
    if (!activeId && list.length > 0) setActiveId(list[0].id);
    if (activeId && !list.some((d) => d.id === activeId)) setActiveId(list[0]?.id ?? null);
  }, [datasets.data, activeId]);

  if (datasets.isLoading) return <Skeleton className="h-40" />;

  const list = datasets.data?.datasets ?? [];
  const active = list.find((d) => d.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      {/* Seletor de listas + nova */}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((d) => (
          <Button
            key={d.id}
            variant={d.id === activeId ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => { setActiveId(d.id); setAdding(false); }}
          >
            <Star className="h-3 w-3" /> {d.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3" /> Nova lista NPS
        </Button>
      </div>

      {adding && (
        <AddDatasetForm
          projectId={projectId}
          funnelId={funnelId}
          stageId={stageId}
          onDone={(id) => { setAdding(false); if (id) setActiveId(id); }}
        />
      )}

      {!adding && !active && list.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma lista de NPS ainda. Clique em <strong>Nova lista NPS</strong> para subir a planilha (ex.: &quot;NPS Dia 1&quot;).
        </p>
      )}

      {!adding && active && (
        <DatasetView key={active.id} projectId={projectId} funnelId={funnelId} stageId={stageId} dataset={active} />
      )}
    </div>
  );
}

// ---- Form de nova lista (planilha + sheet + label) ----
function AddDatasetForm({ projectId, funnelId, stageId, onDone }: Props & { onDone: (id: string | null) => void }) {
  const spreadsheets = useSpreadsheets();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const sheets = useSpreadsheetSheets(spreadsheetId || null);
  const [sheetName, setSheetName] = useState("");
  const [label, setLabel] = useState("NPS Dia 1");
  const create = useCreateNpsDataset(projectId, funnelId, stageId);

  const ssList = spreadsheets.data?.spreadsheets ?? [];
  const spreadsheetName = ssList.find((s) => s.id === spreadsheetId)?.name ?? "";

  function handleCreate() {
    if (!spreadsheetId || !sheetName || !label.trim()) {
      toast.error("Escolha a planilha, a aba e dê um nome à lista.");
      return;
    }
    create.mutate(
      { label: label.trim(), spreadsheetId, spreadsheetName, sheetName },
      { onSuccess: (ds) => { toast.success("Lista NPS criada — agora mapeie as colunas."); onDone(ds.id); }, onError: (e) => toast.error(errMsg(e)) },
    );
  }

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3 max-w-xl">
      <h3 className="text-sm font-semibold">Nova lista de NPS</h3>
      <div className="space-y-1">
        <Label className="text-xs">Nome da lista</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="NPS Dia 1" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Planilha</Label>
        {spreadsheets.isLoading ? (
          <Skeleton className="h-9" />
        ) : (
          <select className={selectCls} value={spreadsheetId} onChange={(e) => { setSpreadsheetId(e.target.value); setSheetName(""); }}>
            <option value="">Selecione…</option>
            {ssList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {spreadsheetId && (
        <div className="space-y-1">
          <Label className="text-xs">Aba</Label>
          {sheets.isLoading ? (
            <Skeleton className="h-9" />
          ) : (
            <select className={selectCls} value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
              <option value="">Selecione…</option>
              {(sheets.data?.sheets ?? []).map((sh) => <option key={sh.sheetId} value={sh.title}>{sh.title}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone(null)}>Cancelar</Button>
      </div>
    </section>
  );
}

// ---- Dataset: mapeamento de colunas + cruzamento ----
function DatasetView({ projectId, funnelId, stageId, dataset }: Props & { dataset: NpsDataset }) {
  const sheetData = useSheetData(dataset.spreadsheetId, dataset.sheetName);
  const patch = usePatchNpsMapping(projectId, funnelId, stageId);
  const del = useDeleteNpsDataset(projectId, funnelId, stageId);

  const headers = sheetData.data?.headers ?? [];
  const [map, setMap] = useState<NpsColumnMapping>(dataset.columnMapping ?? {});
  useEffect(() => { setMap(dataset.columnMapping ?? {}); }, [dataset.id, dataset.columnMapping]);

  const mapped = Boolean(dataset.columnMapping?.score);
  const cross = useNpsCross(projectId, funnelId, stageId, dataset.id, mapped);

  function field(key: keyof NpsColumnMapping, labelTxt: string, required?: boolean) {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{labelTxt}{required && <span className="text-red-500"> *</span>}</Label>
        <select className={selectCls} value={map[key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [key]: e.target.value || undefined }))}>
          <option value="">—</option>
          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
    );
  }

  function saveMapping() {
    if (!map.score) { toast.error("Mapeie ao menos a coluna da Nota (0–10)."); return; }
    patch.mutate({ datasetId: dataset.id, mapping: map }, { onSuccess: () => toast.success("Mapeamento salvo"), onError: (e) => toast.error(errMsg(e)) });
  }

  return (
    <div className="space-y-4">
      {/* Mapeamento */}
      <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{dataset.label} — colunas</h3>
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500"
            onClick={() => del.mutate(dataset.id, { onSuccess: () => toast.success("Lista removida"), onError: (e) => toast.error(errMsg(e)) })}
            disabled={del.isPending}
          >
            {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Remover
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Planilha <strong>{dataset.spreadsheetName}</strong> · aba <strong>{dataset.sheetName}</strong>.
          O cruzamento usa o e-mail (e cai pra nome quando não houver e-mail).
        </p>
        {sheetData.isLoading ? (
          <Skeleton className="h-20" />
        ) : sheetData.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <span>Erro ao ler a planilha.</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => sheetData.refetch()}>
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {field("score", "Nota (0–10)", true)}
              {field("email", "E-mail")}
              {field("name", "Nome")}
              {field("timestamp", "Data/Hora")}
            </div>
            <Button size="sm" className="gap-1.5" onClick={saveMapping} disabled={patch.isPending}>
              {patch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar mapeamento
            </Button>
          </>
        )}
      </section>

      {/* Cruzamento */}
      {!mapped ? (
        <p className="text-xs text-muted-foreground">Mapeie e salve a coluna da Nota para ver o cruzamento.</p>
      ) : cross.isLoading ? (
        <Skeleton className="h-48" />
      ) : cross.isError ? (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <span>Erro ao cruzar.</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => cross.refetch()}>
            <RefreshCw className="h-3 w-3" /> Tentar de novo
          </Button>
        </div>
      ) : cross.data ? (
        <CrossTable data={cross.data} />
      ) : null}
    </div>
  );
}

const sentimentBadge: Record<string, { label: string; cls: string }> = {
  promotor: { label: "Promotor", cls: "bg-emerald-500/15 text-emerald-500" },
  neutro: { label: "Neutro", cls: "bg-amber-500/15 text-amber-500" },
  detrator: { label: "Detrator", cls: "bg-red-500/15 text-red-500" },
};

function CrossTable({ data }: { data: NonNullable<ReturnType<typeof useNpsCross>["data"]> }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const rows = data.rows;
  const s = data.summary;

  const toggle = (i: number) => setOpen((prev) => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const cards = useMemo(() => ([
    { label: "Respondentes", value: s.total },
    { label: "NPS", value: s.npsScore, tone: s.npsScore >= 0 ? "text-emerald-500" : "text-red-500" },
    { label: "Promotores", value: s.promotores, tone: "text-emerald-500" },
    { label: "Neutros", value: s.neutros, tone: "text-amber-500" },
    { label: "Detratores", value: s.detratores, tone: "text-red-500" },
    { label: "Achados no Loyola", value: `${s.matched}/${s.total}` },
  ]), [s]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
            <p className={`text-lg font-semibold ${c.tone ?? ""}`}>{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      {data.surveysFound === 0 && (
        <p className="text-[11px] text-amber-500">
          Nenhuma pesquisa do Loyola configurada nesta etapa — o cruzamento não tem com quem casar. Configure a aba Pesquisas.
        </p>
      )}

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-6" />
              <th className="text-left font-medium px-2 py-2">Nome</th>
              <th className="text-left font-medium px-2 py-2">E-mail</th>
              <th className="text-center font-medium px-2 py-2">Nota</th>
              <th className="text-left font-medium px-2 py-2">Sentimento</th>
              <th className="text-left font-medium px-2 py-2">No Loyola</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <RowItem key={i} row={r} i={i} open={open.has(i)} onToggle={() => toggle(i)} loyolaColumns={data.loyolaColumns} />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-xs text-muted-foreground">Sem respondentes na lista.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowItem({ row, i, open, onToggle, loyolaColumns }: { row: NpsCrossRow; i: number; open: boolean; onToggle: () => void; loyolaColumns: string[] }) {
  const sb = row.sentiment ? sentimentBadge[row.sentiment] : null;
  return (
    <>
      <tr className={`border-t border-border/30 ${i % 2 ? "bg-muted/10" : ""}`}>
        <td className="px-1 text-center">
          {row.matched && (
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        <td className="px-2 py-1.5 truncate max-w-[180px]">{row.name ?? "—"}</td>
        <td className="px-2 py-1.5 truncate max-w-[200px] text-muted-foreground">{row.email ?? "—"}</td>
        <td className="px-2 py-1.5 text-center font-medium">{row.score ?? "—"}</td>
        <td className="px-2 py-1.5">
          {sb ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${sb.cls}`}>{sb.label}</span> : <span className="text-[10px] text-muted-foreground">sem nota</span>}
        </td>
        <td className="px-2 py-1.5">
          {row.matched
            ? <Badge variant="secondary" className="text-[10px]">sim ({row.matchedBy})</Badge>
            : <span className="text-[10px] text-muted-foreground">não encontrado</span>}
        </td>
      </tr>
      {open && row.loyola && (
        <tr className="bg-muted/20 border-t border-border/20">
          <td />
          <td colSpan={5} className="px-3 py-2">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {loyolaColumns.map((col) => {
                const v = row.loyola?.[col];
                if (!v) return null;
                return (
                  <div key={col} className="text-[11px]">
                    <span className="text-muted-foreground">{col}: </span>
                    <span>{v}</span>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
