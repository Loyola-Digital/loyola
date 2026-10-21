"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Plus, Table as TableIcon, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelSpreadsheets } from "@/lib/hooks/use-funnel-spreadsheets";
import { FunnelSpreadsheetWizardDialog } from "@/components/funnels/funnel-spreadsheet-wizard-dialog";
import { FunnelSpreadsheetListItem } from "@/components/funnels/funnel-spreadsheet-list-item";
import { WebhookLeadsDialog } from "@/components/funnels/webhook-leads-dialog";

interface FunnelSpreadsheetsTabProps {
  projectId: string;
  funnelId: string;
  stageId?: string;
}

export function FunnelSpreadsheetsTab({ projectId, funnelId, stageId }: FunnelSpreadsheetsTabProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const { data, isLoading, error } = useFunnelSpreadsheets(projectId, funnelId, stageId);

  useEffect(() => {
    if (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar planilhas.");
    }
  }, [error]);

  const spreadsheets = data?.spreadsheets ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Planilhas vinculadas</h2>
          {spreadsheets.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({spreadsheets.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWebhookOpen(true)}
            className="gap-1.5"
          >
            <Webhook className="h-3.5 w-3.5" />
            Receber por webhook
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWizardOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Vincular planilha
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : spreadsheets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/30 p-8 text-center space-y-3">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Nenhuma planilha vinculada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vincule planilhas de leads, vendas ou dados customizados para acompanhar o
              funil com dados estruturados — ou receba os leads direto por webhook, sem
              planilha no meio.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => setWizardOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Vincular primeira planilha
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setWebhookOpen(true)}
            className="gap-1.5"
          >
            <Webhook className="h-3.5 w-3.5" />
            Receber leads por webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {spreadsheets.map((sheet) => (
            <FunnelSpreadsheetListItem
              key={sheet.id}
              spreadsheet={sheet}
              projectId={projectId}
              funnelId={funnelId}
            />
          ))}
        </div>
      )}

      <WebhookLeadsDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        spreadsheetId={null}
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
      />

      <FunnelSpreadsheetWizardDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}
