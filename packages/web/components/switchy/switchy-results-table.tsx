"use client";

import { Copy, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { SwitchyGenerateResult } from "@/lib/hooks/use-switchy";

interface Props {
  results: SwitchyGenerateResult[];
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Link copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

/** Garante uma URL absoluta clicável (short urls podem vir sem protocolo). */
function withProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function SwitchyResultsTable({ results }: Props) {
  if (results.length === 0) return null;

  const successCount = results.filter((r) => !r.error).length;
  const hasErrors = successCount < results.length;

  return (
    <div className="space-y-2">
      {hasErrors && (
        <div className="flex items-center gap-2 text-xs text-amber-500">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>
            {successCount} de {results.length} gerados com sucesso
          </span>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead>medium</TableHead>
              <TableHead>source</TableHead>
              <TableHead>Short URL</TableHead>
              <TableHead className="w-[70px] text-right">Copiar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r, i) => {
              const copyValue = r.shortUrl ?? r.fullUrl;
              return (
                <TableRow key={`${r.label}-${i}`}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-1.5">
                      {r.error ? (
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      {r.label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.medium}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.source}</code>
                  </TableCell>
                  <TableCell>
                    {r.error ? (
                      <Badge variant="destructive" className="text-[10px] font-normal">
                        {r.error}
                      </Badge>
                    ) : r.shortUrl ? (
                      <a
                        href={withProtocol(r.shortUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <code className="text-xs">{r.shortUrl}</code>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground truncate max-w-[280px] inline-block align-bottom"
                        title={r.fullUrl}
                      >
                        {r.fullUrl}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(copyValue)}
                      disabled={!copyValue}
                      aria-label={`Copiar link do canal ${r.label}`}
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
    </div>
  );
}
