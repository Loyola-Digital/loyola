"use client";

/**
 * Story 47.2 — a listagem comum das seis abas (spec § 6): busca por texto,
 * "Mostrar inativos" (desligado por padrão, vai para a API), ordenação pela
 * coluna principal, Novo, e por linha Editar · Excluir · Desativar/Reativar,
 * mais "Usado em N campanhas" que vem pronto da API.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownAZ, ArrowUpAZ, Pencil, Plus, Power, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { casaBusca } from "@/lib/utils/nomenclatura-cascata";

export interface Coluna<T> {
  chave: keyof T & string;
  titulo: string;
  render?: (linha: T) => ReactNode;
  mono?: boolean;
  className?: string;
}

interface LinhaBase {
  id: string;
  active: boolean;
  usadoEm: number;
}

export function TabelaDoDicionario<T extends LinhaBase>(props: {
  linhas: T[] | undefined;
  carregando: boolean;
  erro?: string | null;
  colunas: Coluna<T>[];
  buscaEm: (keyof T & string)[];
  ordenarPor: keyof T & string;
  inativos: boolean;
  onInativos: (v: boolean) => void;
  onNovo?: () => void;
  novoDesabilitado?: string;
  onEditar: (linha: T) => void;
  onExcluir: (linha: T) => void;
  onAlternar: (linha: T, ativo: boolean) => void;
  podeEditar: boolean;
  filtros?: ReactNode;
  rotuloDoNovo?: string;
  vazio?: string;
}) {
  const { linhas, carregando, erro, colunas, buscaEm, ordenarPor, inativos, onInativos, onNovo, novoDesabilitado, onEditar, onExcluir, onAlternar, podeEditar, filtros, rotuloDoNovo = "Novo", vazio = "Nada cadastrado ainda." } = props;
  const [busca, setBusca] = useState("");
  const [asc, setAsc] = useState(true);

  const visiveis = useMemo(() => {
    const lista = (linhas ?? []).filter((l) => casaBusca(busca, l as Record<string, unknown>, buscaEm));
    return [...lista].sort((a, b) => {
      const x = String(a[ordenarPor] ?? "");
      const y = String(b[ordenarPor] ?? "");
      return asc ? x.localeCompare(y) : y.localeCompare(x);
    });
  }, [linhas, busca, buscaEm, ordenarPor, asc]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {filtros}
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="busca" className="text-xs text-muted-foreground">
            Buscar
          </Label>
          <Input id="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, descrição…" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={inativos} onCheckedChange={onInativos} />
          Mostrar inativos
        </label>
        {podeEditar && onNovo ? (
          <Button onClick={onNovo} disabled={Boolean(novoDesabilitado)} title={novoDesabilitado}>
            <Plus className="mr-1 h-4 w-4" />
            {rotuloDoNovo}
          </Button>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => (
                <TableHead key={c.chave} className={c.className}>
                  {c.chave === ordenarPor ? (
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => setAsc((v) => !v)}>
                      {c.titulo}
                      {asc ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    c.titulo
                  )}
                </TableHead>
              ))}
              <TableHead className="text-right">Usado em</TableHead>
              <TableHead>Ativo</TableHead>
              {podeEditar ? <TableHead className="text-right">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colunas.length + 3}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : visiveis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas.length + 3} className="text-center text-sm text-muted-foreground">
                  {busca ? "Nada casa com a busca." : vazio}
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((l) => (
                <TableRow key={l.id} className={l.active ? undefined : "opacity-60"}>
                  {colunas.map((c) => (
                    <TableCell key={c.chave} className={`${c.mono ? "font-mono" : ""} ${c.className ?? ""}`}>
                      {c.render ? c.render(l) : String(l[c.chave] ?? "")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {l.usadoEm > 0 ? `${l.usadoEm} campanha${l.usadoEm > 1 ? "s" : ""}` : "—"}
                  </TableCell>
                  <TableCell>{l.active ? <Badge variant="secondary">ativo</Badge> : <Badge variant="outline">inativo</Badge>}</TableCell>
                  {podeEditar ? (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => onEditar(l)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {l.active ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => onAlternar(l, false)} title="Desativar">
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onExcluir(l)} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => onAlternar(l, true)} title="Reativar">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
