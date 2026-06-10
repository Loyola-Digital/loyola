"use client";

import { Copy, ExternalLink, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useSwitchyHistory } from "@/lib/hooks/use-switchy";

interface Props {
  projectId: string;
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

export function SwitchyHistoryList({ projectId }: Props) {
  const history = useSwitchyHistory(projectId);
  const links = history.data ?? [];

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
                  <TableHead>utm_campaign</TableHead>
                  <TableHead>Short URL</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[70px] text-right">Copiar</TableHead>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
