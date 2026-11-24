"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronLeft, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useInstagramReport,
  useBaixarRelatorioEmHtml,
} from "@/lib/hooks/use-instagram-report";
import {
  MonthlyReportView,
  MonthlyReportSkeleton,
} from "@/components/instagram/monthly-report-view";

interface Props {
  params: Promise<{ id: string; reportId: string }>;
}

export default function InstagramMonthlyReportPage({ params }: Props) {
  const { id: projectId, reportId } = use(params);
  const { data, isLoading, error } = useInstagramReport(projectId, reportId);
  const baixar = useBaixarRelatorioEmHtml(projectId);

  return (
    <div className="space-y-4">
      <div className="print:hidden flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${projectId}/reports/instagram`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar para histórico
          </Link>
        </Button>
        {data && (
          <Button
            variant="outline"
            size="sm"
            disabled={baixar.isPending}
            title="Baixar este relatório como arquivo HTML"
            onClick={() =>
              baixar.mutate(
                { reportId, monthLabel: data.data.monthLabel },
                {
                  onError: (err) =>
                    toast.error(err instanceof Error ? err.message : "Erro ao baixar"),
                },
              )
            }
          >
            <Download className="h-3.5 w-3.5 mr-2" />
            {baixar.isPending ? "Gerando..." : "Baixar HTML"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <MonthlyReportSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold">Relatório não encontrado</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Pode ter sido removido ou você não tem acesso a este projeto.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/instagram`}>Ir pro dashboard</Link>
          </Button>
        </div>
      ) : data ? (
        <MonthlyReportView data={data.data} />
      ) : null}
    </div>
  );
}
