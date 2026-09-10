"use client";

/**
 * Story 47.9 — listagem de VSLs: nome mono com copiar, expert, produto, lead,
 * problema, solução, oferta, criada em; filtros por expert, produto e oferta,
 * busca no nome; ações Editar e Duplicar. Sem "publicar" (D18).
 */

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Files, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { erroDaApi, useListaDe, useVsls } from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import { copiarTexto } from "../previa-do-nome";
import { SeletorDeExpert } from "../seletor-de-expert";

const TODOS = "__todos__";

export function ListaDeVsls() {
  const [expertId, setExpertId] = useState("");
  const [productId, setProductId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [q, setQ] = useState("");
  const produtos = useListaDe("produtos", { expertId: expertId || undefined, inativos: true }, { enabled: Boolean(expertId) });
  const ofertas = useListaDe("ofertas", { expertId: expertId || undefined, inativos: true }, { enabled: Boolean(expertId) });
  const lista = useVsls({ expertId: expertId || undefined, productId: productId || undefined, offerId: offerId || undefined, q: q.trim() || undefined, limit: 100 });

  const filtro = (id: string, label: string, valor: string, onChange: (v: string) => void, opcoes: { id: string; rotulo: string }[]) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={valor || TODOS} onValueChange={(v) => onChange(v === TODOS ? "" : v)} disabled={!expertId}>
        <SelectTrigger id={id}><SelectValue placeholder={expertId ? "Todos" : "Escolha o expert antes"} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.rotulo}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{lista.data ? `${lista.data.total} VSL${lista.data.total === 1 ? "" : "s"}` : ""}</p>
        <Button asChild>
          <Link href={hrefDe("vsl", "nova")}><Plus className="mr-1 h-4 w-4" /> Nova VSL</Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SeletorDeExpert valor={expertId} onChange={(v) => { setExpertId(v); setProductId(""); setOfferId(""); }} permitirTodos id="f-vsl-expert" />
        {filtro("f-vsl-produto", "Produto", productId, setProductId, (produtos.data ?? []).map((p) => ({ id: p.id, rotulo: `${p.slug} — ${p.name}` })))}
        {filtro("f-vsl-oferta", "Oferta", offerId, setOfferId, (ofertas.data ?? []).map((o) => ({ id: o.id, rotulo: o.rotulo })))}
        <div className="space-y-1">
          <Label htmlFor="f-vsl-q" className="text-xs text-muted-foreground">Buscar no nome</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="f-vsl-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="vsl_dg_…" className="pl-8 font-mono" />
          </div>
        </div>
      </div>

      {lista.error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erroDaApi(lista.error).mensagem}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Expert</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Problema</TableHead>
              <TableHead>Solução</TableHead>
              <TableHead>Oferta</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading ? (
              [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
            ) : (lista.data?.itens.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">Nenhuma VSL ainda. <Link className="underline" href={hrefDe("vsl", "nova")}>Criar a primeira</Link>.</TableCell></TableRow>
            ) : (
              lista.data!.itens.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-sm">{v.name}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar nome" onClick={() => void copiarTexto(v.name)}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{v.expertCode}</TableCell>
                  <TableCell className="font-mono">{v.productSlug}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={v.leadRotulo}>{v.leadRotulo}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={v.problemRotulo}>{v.problemRotulo}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={v.solutionRotulo}>{v.solutionRotulo}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={v.offerRotulo}>{v.offerRotulo}</TableCell>
                  <TableCell>{v.url ? <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2" title={v.url}><ExternalLink className="h-3.5 w-3.5" />abrir</a> : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(v.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("vsl", "nova")}&editar=${v.id}`}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("vsl", "nova")}&duplicar=${v.id}`}><Files className="mr-1 h-3.5 w-3.5" />Duplicar</Link></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {lista.data && lista.data.total > 100 ? <p className="text-xs text-muted-foreground">Mostrando as 100 mais recentes — refine os filtros.</p> : null}
    </div>
  );
}
