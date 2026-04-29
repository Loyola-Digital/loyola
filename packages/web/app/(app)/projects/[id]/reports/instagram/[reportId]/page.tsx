"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstagramReport } from "@/lib/hooks/use-instagram-report";
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

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${projectId}/reports/instagram`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar para histórico
          </Link>
        </Button>
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
