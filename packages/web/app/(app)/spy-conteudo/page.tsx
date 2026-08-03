"use client";

/**
 * Spy de Conteúdo — raio-x de um perfil do Instagram (Apify + Claude).
 *
 * Não confundir com /instagram, que é insights das contas PRÓPRIAS via Meta API.
 * Aqui o alvo é perfil de TERCEIRO.
 *
 * Esta página é o composer + a galeria de perfis já escaneados. O relatório
 * vive em `/spy-conteudo/[scanId]` e abre em ABA NOVA — é longo demais pra um
 * painel lateral, e em aba própria dá pra comparar dois perfis lado a lado.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle, Radar, Trash2, Clock, CheckCircle2, XCircle, Loader2, ArrowUpRight,
} from "lucide-react";
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
import { ScanComposer } from "@/components/spy-conteudo/scan-composer";

function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
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
  running: { label: "Analisando", className: "text-primary", Icon: Loader2 },
  done: { label: "Pronto", className: "text-emerald-600 dark:text-emerald-500", Icon: CheckCircle2 },
  failed: { label: "Falhou", className: "text-red-500", Icon: XCircle },
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

function ScanCard({ scan, onDelete }: { scan: ScanListItem; onDelete: () => void }) {
  const pronto = scan.status === "done";
  return (
    <div className="group relative rounded-xl border border-border/40 bg-card p-4 transition-colors hover:border-border">
      {/* Abre em aba nova: o relatório é uma leitura longa, e a lista continua
          disponível pra disparar o próximo scan sem perder o lugar. */}
      <Link
        href={`/spy-conteudo/${scan.id}`}
        target="_blank"
        rel="noopener"
        className="block"
        aria-label={`Abrir relatório de @${scan.username} em nova aba`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold group-hover:underline">
              @{scan.username}
            </p>
            <div className="mt-1"><StatusBadge status={scan.status} /></div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        </div>

        {pronto && scan.profile && (
          <div className="mt-3 flex gap-4 border-t border-border/30 pt-2.5">
            {([
              ["Seguidores", scan.profile.followersCount],
              ["Publicações", scan.profile.postsCount],
            ] as const).map(([label, v]) => (
              <div key={label}>
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="text-sm font-semibold leading-tight">{fmtCompact(v)}</p>
              </div>
            ))}
          </div>
        )}

        {scan.focus && (
          <p className="mt-2 line-clamp-2 text-[11px] italic leading-relaxed text-muted-foreground">
            “{scan.focus}”
          </p>
        )}
        {scan.status === "failed" && scan.error && (
          <p className="mt-2 line-clamp-2 text-[11px] text-red-500">{scan.error}</p>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          {fmtWhen(scan.createdAt)}
          {scan.requestedByName ? ` · ${scan.requestedByName}` : ""}
        </p>
      </Link>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={onDelete}
        title="Excluir scan"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function SpyConteudoPage() {
  const role = useUserRole();
  const { data, isLoading } = useInstagramScans();
  const createScan = useCreateInstagramScan();
  const deleteScan = useDeleteInstagramScan();
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
        toast.info(result.message ?? "Scan recente reaproveitado.", {
          action: { label: "Forçar novo", onClick: () => void handleScan({ ...input, force: true }) },
        });
      } else {
        toast.success(
          `@${result.username} entrou na fila${
            result.queuePosition ? ` (${result.queuePosition} na frente)` : ""
          }. Leva alguns minutos — o card aparece aqui quando ficar pronto.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar o scan");
      throw e; // o composer volta ao passo da pergunta em vez de resetar
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] p-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Radar className="h-6 w-6 text-primary" />
          Spy de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground">
          Raio-x de um perfil do Instagram: nicho, público, pilares, estratégia e o que a pessoa
          ensina em cada vídeo. Só perfis públicos.
        </p>
      </div>

      <ScanComposer onSubmit={handleScan} pending={createScan.isPending} />

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Perfis escaneados
        </p>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
            <Radar className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum perfil escaneado ainda. Mande um @ acima pra começar.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scans.map((scan) => (
              <ScanCard key={scan.id} scan={scan} onDelete={() => setConfirmDelete(scan.id)} />
            ))}
          </div>
        )}
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
                deleteScan.mutate(confirmDelete, {
                  onSuccess: () => toast.success("Scan excluído"),
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
