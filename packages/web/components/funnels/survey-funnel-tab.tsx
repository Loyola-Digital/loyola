"use client";

import { useState } from "react";
import {
  FileSpreadsheet, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Search, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useSpreadsheets, useSpreadsheetSheets, useSheetData,
  useFunnelSurveys, useAddFunnelSurvey, useRemoveFunnelSurvey,
  useRefreshSheetData, useSurveySummary,
} from "@/lib/hooks/use-google-sheets";

function fmtNumber(val: number): string {
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

// ============================================================
// SHEETS PICKER DIALOG
// ============================================================

function SheetsPickerDialog({ projectId, funnelId, open, onOpenChange }: {
  projectId: string; funnelId: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(selectedSpreadsheet?.id ?? null);
  const [search, setSearch] = useState("");
  const addSurvey = useAddFunnelSurvey(projectId, funnelId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : spreadsheets;

  function handleAddSheet(sheetName: string) {
    if (!selectedSpreadsheet) return;
    addSurvey.mutate(
      { spreadsheetId: selectedSpreadsheet.id, spreadsheetName: selectedSpreadsheet.name, sheetName },
      {
        onSuccess: () => { toast.success(`Aba "${sheetName}" vinculada!`); },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
      }
    );
  }

  function handleClose() {
    setSelectedSpreadsheet(null);
    setSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Vincular planilha de pesquisa
          </DialogTitle>
        </DialogHeader>

        {!selectedSpreadsheet ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar planilha..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>

            {spreadsheetsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "Nenhuma planilha encontrada." : "Nenhuma planilha no Google Drive."}
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {filtered.map((s) => (
                  <button key={s.id} onClick={() => setSelectedSpreadsheet(s)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border/30 p-3 text-left hover:bg-accent transition-colors">
                    <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-sm truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedSpreadsheet(null)} className="text-xs text-muted-foreground hover:text-foreground">← Voltar</button>
              <span className="text-sm font-medium">{selectedSpreadsheet.name}</span>
            </div>

            <p className="text-xs text-muted-foreground">Selecione a aba de pesquisa:</p>

            {sheetsLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (sheetsData?.sheets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma aba encontrada.</p>
            ) : (
              <div className="space-y-1">
                {(sheetsData?.sheets ?? []).map((sheet) => (
                  <div key={sheet.title} className="flex items-center justify-between rounded-lg border border-border/30 p-3">
                    <div>
                      <p className="text-sm font-medium">{sheet.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtNumber(sheet.rowCount)} linhas</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleAddSheet(sheet.title)} disabled={addSurvey.isPending}>
                      <Plus className="h-3.5 w-3.5" />
                      Vincular
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SURVEY DATA SECTION (collapsible)
// ============================================================

function SurveyDataSection({ survey, projectId, funnelId }: { survey: { id: string; spreadsheetId: string; spreadsheetName: string; sheetName: string }; projectId: string; funnelId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSheetData(open ? survey.spreadsheetId : null, open ? survey.sheetName : null);
  const removeSurvey = useRemoveFunnelSurvey(projectId, funnelId);
  const refreshData = useRefreshSheetData();
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const rows = data?.rows ?? [];
  const headers = data?.headers ?? [];
  const totalPages = Math.ceil(rows.length / pageSize);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  // Column summary: detect categorical columns
  const columnSummaries = open && data ? headers.map((header, i) => {
    const values = rows.map((r) => r[i] ?? "").filter(Boolean);
    const unique = new Set(values);
    if (unique.size <= 10 && unique.size > 0 && values.length > 0) {
      const counts: Record<string, number> = {};
      for (const v of values) { counts[v] = (counts[v] ?? 0) + 1; }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return { header, type: "categorical" as const, distribution: sorted, total: values.length };
    }
    return { header, type: "text" as const, distribution: [], total: values.length };
  }) : [];

  const categoricalColumns = columnSummaries.filter((c) => c.type === "categorical");

  return (
    <div className="rounded-lg border border-border/20 bg-muted/5 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">{survey.spreadsheetName}</span>
          <span className="text-xs text-muted-foreground">/ {survey.sheetName}</span>
          {data && <Badge variant="secondary" className="text-[10px]">{fmtNumber(data.totalRows)} respostas</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); refreshData.mutate({ spreadsheetId: survey.spreadsheetId, sheetName: survey.sheetName }); }}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshData.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={(e) => {
            e.stopPropagation();
            removeSurvey.mutate(survey.id, { onSuccess: () => toast.success("Pesquisa removida.") });
          }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/20 p-4 space-y-4">
          {isLoading ? <Skeleton className="h-48" /> : !data ? (
            <p className="text-sm text-muted-foreground">Erro ao carregar dados.</p>
          ) : (
            <>
              {/* Column summaries */}
              {categoricalColumns.length > 0 && (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {categoricalColumns.map((col) => (
                    <div key={col.header} className="rounded-lg border border-border/20 p-3 space-y-2">
                      <p className="text-xs font-medium">{col.header}</p>
                      <div className="space-y-1">
                        {col.distribution.map(([value, count]) => {
                          const pct = col.total > 0 ? (count / col.total) * 100 : 0;
                          return (
                            <div key={value} className="flex items-center gap-2">
                              <div className="flex-1 h-5 rounded bg-muted/30 overflow-hidden">
                                <div className="h-full rounded bg-primary/30" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-20 text-right">{value}</span>
                              <span className="text-[10px] font-medium w-10 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Data table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {headers.map((h, i) => (
                        <th key={i} className="text-left py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border/10 hover:bg-muted/20">
                        {headers.map((_, ci) => (
                          <td key={ci} className="py-1.5 px-2 max-w-[200px] truncate">{row[ci] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} de {rows.length}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Proximo</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN TAB COMPONENT
// ============================================================

interface SurveyFunnelTabProps {
  projectId: string;
  funnelId: string;
  totalLeads?: number;
}

export function SurveyFunnelTab({ projectId, funnelId, totalLeads }: SurveyFunnelTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: surveysData, isLoading } = useFunnelSurveys(projectId, funnelId);
  const { data: summaryData } = useSurveySummary(projectId, funnelId);

  const surveys = surveysData?.surveys ?? [];
  const totalResponses = summaryData?.totalResponses ?? 0;
  const responseRate = totalLeads && totalLeads > 0 ? (totalResponses / totalLeads) * 100 : null;

  return (
    <div className="space-y-4">
      {/* KPI + actions header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {responseRate !== null && (
            <div className={`rounded-lg border px-3 py-2 ${responseRate >= 30 ? "border-emerald-500/30 bg-emerald-500/5" : responseRate >= 10 ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-bold">{responseRate.toFixed(1)}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{fmtNumber(totalResponses)} respostas de {fmtNumber(totalLeads!)} leads</p>
            </div>
          )}
          {surveys.length > 0 && !responseRate && (
            <Badge variant="secondary">{surveys.length} pesquisa{surveys.length > 1 ? "s" : ""} vinculada{surveys.length > 1 ? "s" : ""}</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Vincular planilha
        </Button>
      </div>

      {/* Surveys list */}
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/30 p-8 text-center">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma pesquisa vinculada</p>
          <p className="text-sm text-muted-foreground mt-1">Vincule uma planilha do Google Sheets para acompanhar respostas de pesquisa.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {surveys.map((survey) => (
            <SurveyDataSection key={survey.id} survey={survey} projectId={projectId} funnelId={funnelId} />
          ))}
        </div>
      )}

      <SheetsPickerDialog projectId={projectId} funnelId={funnelId} open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
