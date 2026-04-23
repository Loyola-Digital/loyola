"use client";

import { useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { useAuditStatus } from "@/lib/hooks/use-audit-status";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface AuditStatusBadgeProps {
  stageId: string;
  funnelId: string;
  projectId: string;
  className?: string;
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora mesmo";
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;

  return then.toLocaleDateString("pt-BR");
}

function formatFullDateTime(date: string): string {
  return new Date(date).toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function AuditStatusBadge({
  stageId,
  funnelId,
  projectId,
  className = "",
}: AuditStatusBadgeProps) {
  const { data, isLoading, audit, isAuditing, cancelAudit, isCancelling } = useAuditStatus(
    stageId,
    funnelId,
    projectId,
  );
  const [showTooltip, setShowTooltip] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const isAudited = data?.auditStatus === "audited" && data?.lastAuditAt;

  const handleAudit = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmAudit = async () => {
    try {
      await audit();
      toast.success("Dashboard auditado com sucesso!");
      setShowConfirmDialog(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao auditar dashboard"
      );
    }
  };

  const handleConfirmCancel = async () => {
    try {
      await cancelAudit();
      toast.success("Auditoria cancelada");
      setShowCancelDialog(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao cancelar auditoria"
      );
    }
  };

  if (isLoading) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Button
        variant={isAudited ? "outline" : "ghost"}
        size="sm"
        onClick={handleAudit}
        disabled={isAuditing}
        className={`gap-2 ${
          isAudited
            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
        } ${className}`}
      >
        {isAuditing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isAudited ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        <span className="text-xs font-medium">
          {isAudited
            ? `Auditado ${formatRelativeTime(data!.lastAuditAt!)}`
            : "Não auditado"}
        </span>
      </Button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
          {isAudited ? (
            <>
              <p className="font-semibold text-green-700 mb-1">
                ✓ Dashboard Auditado
              </p>
              <p className="text-muted-foreground text-xs mb-2">
                <strong>Data/Hora:</strong>{" "}
                {formatFullDateTime(data!.lastAuditAt!)}
              </p>
              <p className="text-muted-foreground text-xs">
                <strong>Por:</strong> {data!.lastAuditBy?.name}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAudit();
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Auditar novamente
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCancelDialog(true);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Cancelar auditoria
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-700 mb-1">
                ⚠ Não Auditado
              </p>
              <p className="text-muted-foreground text-xs">
                Clique no botão para validar e registrar a auditoria deste
                dashboard
              </p>
            </>
          )}
        </div>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Confirmar Auditoria</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja marcar este dashboard como auditado?
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end mt-6">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAudit}
              disabled={isAuditing}
              className="gap-2"
            >
              {isAuditing && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancelar Auditoria</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja cancelar a auditoria desta etapa? O status volta
            pra &quot;não auditado&quot; e o registro anterior é apagado.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end mt-6">
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={isCancelling}
              className="gap-2 bg-red-600 hover:bg-red-700"
            >
              {isCancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar auditoria
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
