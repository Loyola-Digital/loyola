"use client";

import { use, useState } from "react";
import Link from "next/link";
import { FileText, ChevronRight, Plus, ChevronLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstagramReports } from "@/lib/hooks/use-instagram-report";
import { GenerateReportDialog } from "@/components/instagram/generate-report-dialog";

interface Props {
  params: Promise<{ id: string }>;
}

const MONTH_LABELS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabelPt(month: string): string {
  const [y, m] = month.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_LABELS_PT[idx] ?? m} ${y}`;
}

export default function InstagramReportsListPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { data, isLoading } = useInstagramReports(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${projectId}/instagram`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Dashboard Instagram
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Relatórios Instagram
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de relatórios mensais gerados para este projeto.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Novo relatório
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-10 text-center space-y-2">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-semibold">Nenhum relatório gerado ainda</p>
          <p className="text-sm text-muted-foreground">
            Clique em "Novo relatório" pra gerar o primeiro.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((report) => (
            <Link
              key={report.id}
              href={`/projects/${projectId}/reports/instagram/${report.id}`}
              className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/60 p-3 hover:border-border/60 hover:bg-card/80 transition-colors group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{monthLabelPt(report.month)}</p>
                <p className="text-xs text-muted-foreground">
                  Gerado em {format(parseISO(report.generatedAt), "dd/MM/yy 'às' HH:mm")}
                  {report.generatedByName ? ` por ${report.generatedByName}` : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <GenerateReportDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
