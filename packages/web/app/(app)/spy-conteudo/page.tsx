"use client";

/**
 * Spy de Conteúdo — raio-x de um perfil do Instagram (Apify + Claude).
 *
 * Não confundir com /instagram, que é insights das contas PRÓPRIAS via Meta API.
 * Aqui o alvo é perfil de TERCEIRO: nicho, pilares, estratégia e os insights que
 * a pessoa entrega em cada vídeo.
 *
 * O scan roda em background (~5min) — a pessoa dispara e pode sair da página.
 */

import { useState } from "react";
import { AlertCircle, Radar, Trash2, Clock, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useInstagramScans,
  useCreateInstagramScan,
  useDeleteInstagramScan,
  type ScanListItem,
  type ScanStatus,
} from "@/lib/hooks/use-instagram-scans";
import { ScanReport } from "@/components/spy-conteudo/scan-report";
import { ScanComposer } from "@/components/spy-conteudo/scan-composer";

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_META: Record<ScanStatus, { label: string; className: string; Icon: typeof Clock }> = {
  queued: { label: "Na fila", className: "text-muted-foreground", Icon: Clock },
  running: { label: "Coletando", className: "text-sky-500", Icon: Loader2 },
  done: { label: "Pronto", className: "text-emerald-500", Icon: CheckCircle2 },
  failed: { label: "Falhou", className: "text-red-400", Icon: XCircle },
};

function StatusBadge({ status }: { status: ScanStatus }) {
  const { label, className, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${className}`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function ScanCard({
  scan,
  active,
  onOpen,
  onDelete,
}: {
  scan: ScanListItem;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group rounded-lg border p-2.5 transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">@{scan.username}</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={scan.status} />
            {scan.profile && (
              <span className="text-[11px] text-muted-foreground">
                {fmtInt(scan.profile.followersCount)} seg.
              </span>
            )}
          </div>
          {/* A pergunta distingue dois scans do mesmo perfil na lista. */}
          {scan.focus && (
            <p className="mt-1 line-clamp-2 text-[10px] italic text-muted-foreground/90">
              “{scan.focus}”
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {fmtWhen(scan.createdAt)}
            {scan.requestedByName ? ` · ${scan.requestedByName}` : ""}
          </p>
          {scan.status === "failed" && scan.error && (
            <p className="mt-1 line-clamp-2 text-[10px] text-red-400">{scan.error}</p>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          onClick={onDelete}
          title="Excluir scan"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function SpyConteudoPage() {
  const role = useUserRole();
  const { data, isLoading } = useInstagramScans();
  const createScan = useCreateInstagramScan();
  const deleteScan = useDeleteInstagramScan();

  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (role === "guest") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Spy de Conteúdo é restrito à equipe interna.
          </p>
        </div>
      </div>
    );
  }

  const scans = data?.scans ?? [];

  async function handleScan(input: { username: string; focus?: string; force?: boolean }) {
    const value = input.username.trim();
    if (!value) return;
    try {
      const result = await createScan.mutateAsync({
        username: value,
        focus: input.focus,
        force: input.force,
      });
      if (result.reused) {
        // Já existe scan recente do MESMO perfil com a MESMA pergunta: abre o
        // existente em vez de gastar crédito de novo. Dá pra forçar.
        toast.info(result.message ?? "Scan recente reaproveitado.", {
          action: {
            label: "Forçar novo",
            onClick: () => void handleScan({ ...input, force: true }),
          },
        });
        setOpenId(result.id);
      } else {
        toast.success(
          `@${result.username} entrou na fila${
            result.queuePosition ? ` (${result.queuePosition} na frente)` : ""
          }. Leva alguns minutos — pode sair da página.`,
        );
        setOpenId(result.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar o scan");
      // Propaga pro composer voltar ao passo da pergunta em vez de resetar.
      throw e;
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Radar className="h-6 w-6 text-primary" />
          Spy de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground">
          Raio-x de um perfil do Instagram: nicho, público, pilares, estratégia e o que a pessoa
          ensina em cada vídeo. Só perfis públicos.
        </p>
      </div>

      <ScanComposer onSubmit={handleScan} pending={createScan.isPending} />

      {/* Lista + detalhe */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Perfis escaneados
          </p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : scans.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                Nenhum perfil escaneado ainda. Coloque um @ acima pra começar.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {scans.map((scan) => (
                <ScanCard
                  key={scan.id}
                  scan={scan}
                  active={openId === scan.id}
                  onOpen={() => setOpenId(scan.id)}
                  onDelete={() => setConfirmDelete(scan.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {openId ? (
            <ScanReport scanId={openId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-2">
              <Radar className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Selecione um perfil à esquerda pra ver o raio-x completo.
              </p>
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Instagram <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este scan?</AlertDialogTitle>
            <AlertDialogDescription>
              O relatório sai do histórico. Escanear o perfil de novo consome crédito de coleta e de
              análise outra vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDelete) return;
                const id = confirmDelete;
                deleteScan.mutate(id, {
                  onSuccess: () => {
                    toast.success("Scan excluído");
                    if (openId === id) setOpenId(null);
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
                });
                setConfirmDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
