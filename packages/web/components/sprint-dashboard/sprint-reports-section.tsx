"use client";

// Relatórios HTML gerados por IA (skill dashboard-campanhas da Agatha).
// Lista + viewer em iframe sandbox (HTML autocontido, scripts liberados,
// same-origin NÃO — o relatório não enxerga cookies/API do app).

import { useState } from "react";
import { FileBarChart2, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSprintReports,
  useSprintReport,
  useDeleteSprintReport,
  type SprintReportMeta,
} from "@/lib/hooks/use-sprint-reports";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SprintReportsSection() {
  const { data, isLoading } = useSprintReports();
  const deleteMutation = useDeleteSprintReport();
  const [openReport, setOpenReport] = useState<SprintReportMeta | null>(null);
  const { data: fullReport, isLoading: htmlLoading } = useSprintReport(openReport?.id ?? null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const reports = data?.reports ?? [];

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-2">
        <FileBarChart2 className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhum relatório publicado ainda.</p>
        <p className="text-xs text-muted-foreground">
          Os dashboards que o Claude gerar (skill dashboard-campanhas) aparecem aqui
          automaticamente quando publicados via API.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenReport(r)}
            className="rounded-xl border border-border/30 bg-card/60 p-4 text-left hover:border-border/60 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.author ?? "IA"} · {fmtDateTime(r.createdAt)}
                  {r.kind && <span className="ml-1.5 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px]">{r.kind}</span>}
                </p>
              </div>
              <FileBarChart2 className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Clique pra abrir o dashboard
            </p>
          </button>
        ))}
      </div>

      <Dialog open={!!openReport} onOpenChange={(v) => { if (!v) setOpenReport(null); }}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col p-3 gap-2">
          <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
            <DialogTitle className="text-sm truncate">
              {openReport?.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {openReport ? `${openReport.author ?? "IA"} · ${fmtDateTime(openReport.createdAt)}` : ""}
              </span>
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!openReport) return;
                if (!confirm(`Excluir o relatório "${openReport.title}"?`)) return;
                deleteMutation.mutate(openReport.id, {
                  onSuccess: () => { toast.success("Relatório excluído"); setOpenReport(null); },
                  onError: () => toast.error("Erro ao excluir"),
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </DialogHeader>
          <div className="flex-1 rounded-lg border border-border/30 overflow-hidden bg-white">
            {htmlLoading || !fullReport ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <iframe
                title={fullReport.title}
                srcDoc={fullReport.html}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
