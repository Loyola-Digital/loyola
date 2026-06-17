"use client";

import { useState } from "react";
import {
  Copy,
  ExternalLink,
  History,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useSwitchyHistory,
  useUpdateSwitchyHistoryLink,
  useDeleteSwitchyHistoryLink,
  type SwitchyHistoryItem,
} from "@/lib/hooks/use-switchy";

interface Props {
  projectId: string;
  /** Story 33.7: filtra o histórico pelos links de um funil específico. */
  funnelId?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function withProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Link copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

export function SwitchyHistoryList({ projectId, funnelId }: Props) {
  const role = useUserRole();
  const canEdit = role !== null && role !== "guest";
  const history = useSwitchyHistory(projectId, funnelId);
  const links = history.data ?? [];

  const [editing, setEditing] = useState<SwitchyHistoryItem | null>(null);
  const [deleting, setDeleting] = useState<SwitchyHistoryItem | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Histórico de links gerados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : history.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <span>Erro ao carregar histórico: {errMsg(history.error)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => history.refetch()}
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </Button>
          </div>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum link gerado ainda.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>utm_campaign</TableHead>
                  <TableHead>Short URL</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => {
                  const copyValue = l.shortUrl ?? l.fullUrl;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium text-sm">
                        {l.channelLabel ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={l.note ?? undefined}>
                        {l.note ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.utmCampaign ?? "—"}
                      </TableCell>
                      <TableCell>
                        {l.shortUrl ? (
                          <a
                            href={withProtocol(l.shortUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <code className="text-xs">{l.shortUrl}</code>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground truncate max-w-[280px] inline-block align-bottom"
                            title={l.fullUrl}
                          >
                            {l.fullUrl}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(l.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(copyValue)}
                            disabled={!copyValue}
                            aria-label="Copiar link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditing(l)}
                                aria-label="Editar link"
                                title="Editar destino/UTMs"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleting(l)}
                                aria-label="Remover do histórico"
                                title="Remover do histórico"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <EditLinkDialog
          projectId={projectId}
          funnelId={funnelId}
          link={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteLinkDialog
          projectId={projectId}
          funnelId={funnelId}
          link={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}

// ============================================================
// EDIT DIALOG — edita destino/UTMs e atualiza o shortlink no Switchy
// ============================================================

function EditLinkDialog({
  projectId,
  funnelId,
  link,
  onClose,
}: {
  projectId: string;
  funnelId?: string;
  link: SwitchyHistoryItem;
  onClose: () => void;
}) {
  const updateMut = useUpdateSwitchyHistoryLink(projectId, funnelId);
  const [checkoutUrl, setCheckoutUrl] = useState(link.checkoutBaseUrl);
  const [campaign, setCampaign] = useState(link.utmCampaign ?? "");
  const [medium, setMedium] = useState(link.utmMedium ?? "");
  const [source, setSource] = useState(link.utmSource ?? "");
  const [term, setTerm] = useState(link.utmTerm ?? "");
  const [content, setContent] = useState(link.utmContent ?? "");

  function handleSave() {
    if (!checkoutUrl.trim() || !campaign.trim() || !medium.trim() || !source.trim()) {
      toast.error("Preencha checkout, campaign, medium e source.");
      return;
    }
    updateMut.mutate(
      {
        linkId: link.id,
        checkoutUrl: checkoutUrl.trim(),
        campaign: campaign.trim(),
        medium: medium.trim(),
        source: source.trim(),
        ...(term.trim() ? { term: term.trim() } : {}),
        ...(content.trim() ? { content: content.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Link atualizado no Switchy.");
          onClose();
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar link {link.channelLabel ? `· ${link.channelLabel}` : ""}</DialogTitle>
          <DialogDescription>
            Mantém o mesmo link curto ({link.shortUrl ?? "—"}) e atualiza o
            destino/UTMs diretamente no Switchy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-checkout" className="text-xs">Link de checkout</Label>
            <Input id="edit-checkout" value={checkoutUrl} onChange={(e) => setCheckoutUrl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-campaign" className="text-xs">utm_campaign</Label>
            <Input id="edit-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="edit-medium" className="text-xs">utm_medium</Label>
              <Input id="edit-medium" value={medium} onChange={(e) => setMedium(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-source" className="text-xs">utm_source</Label>
              <Input id="edit-source" value={source} onChange={(e) => setSource(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="edit-term" className="text-xs">utm_term (opcional)</Label>
              <Input id="edit-term" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-content" className="text-xs">utm_content (opcional)</Label>
              <Input id="edit-content" value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={updateMut.isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending} className="gap-1.5">
            {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DELETE DIALOG — remove só do histórico local (Switchy não tem delete via API)
// ============================================================

function DeleteLinkDialog({
  projectId,
  funnelId,
  link,
  onClose,
}: {
  projectId: string;
  funnelId?: string;
  link: SwitchyHistoryItem;
  onClose: () => void;
}) {
  const deleteMut = useDeleteSwitchyHistoryLink(projectId, funnelId);

  function handleDelete() {
    deleteMut.mutate(link.id, {
      onSuccess: () => {
        toast.success("Removido do histórico.");
        onClose();
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remover do histórico?</DialogTitle>
          <DialogDescription>
            Remove o link {link.channelLabel ? `"${link.channelLabel}" ` : ""}
            apenas desta lista.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            O shortlink continua <strong>ativo na Switchy</strong> — a API deles
            não permite deletar. Se quiser apagá-lo de vez, remova manualmente no
            painel da Switchy.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleteMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="gap-1.5"
          >
            {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Remover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
