"use client";

/**
 * Story 47.3 — listagem de campanhas (spec § 7, último bloco): nome mono com
 * copiar, expert, produto, funil, oferta, ano, publicada, criada em; filtros e
 * busca vão para a API; ações Editar (se não publicada), Duplicar, Marcar como
 * publicada.
 */

import { useState } from "react";
import Link from "next/link";
import { Copy, Pencil, Files, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { erroDaApi, useCampanhas, useListaDe, usePublicarCampanha } from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import { CASCATA_VAZIA, type Cascata } from "@/lib/utils/nomenclatura-cascata";
import { CascataDeSelects } from "./forms";
import { copiarTexto } from "./previa-do-nome";

export function ListaDeCampanhas() {
  const [cascata, setCascata] = useState<Cascata>(CASCATA_VAZIA);
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const anos = useListaDe("dicionario", { type: "year", inativos: true });
  const lista = useCampanhas({ expertId: cascata.expertId || undefined, productId: cascata.productId || undefined, funnelId: cascata.funnelId || undefined, offerId: cascata.offerId || undefined, year: year || undefined, q: q.trim() || undefined, limit: 100 });
  const publicar = usePublicarCampanha();
  const TODOS = "__todos__";

  async function marcar(id: string, name: string) {
    if (!confirm(`Marcar ${name} como publicada? O nome congela; depois só dá para duplicar.`)) return;
    try {
      await publicar.mutateAsync({ id });
      toast.success("Marcada como publicada.");
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <CascataDeSelects valor={cascata} onChange={setCascata} compacto />
        <div className="space-y-1">
          <Label htmlFor="f-ano" className="text-xs text-muted-foreground">Ano</Label>
          <Select value={year || TODOS} onValueChange={(v) => setYear(v === TODOS ? "" : v)}>
            <SelectTrigger id="f-ano"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {(anos.data ?? []).map((a) => <SelectItem key={a.id} value={a.value}>{a.value}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-q" className="text-xs text-muted-foreground">Buscar no nome</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="bbe_churrasco…" className="pl-8 font-mono" />
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
              <TableHead>Funil</TableHead>
              <TableHead>Oferta</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Publicada</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading ? (
              [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
            ) : (lista.data?.itens.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Nenhuma campanha ainda. <Link className="underline" href={hrefDe("campanhas", "nova")}>Criar a primeira</Link>.</TableCell></TableRow>
            ) : (
              lista.data!.itens.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-sm">{c.name}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar nome" onClick={() => void copiarTexto(c.name)}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{c.expertCode}</TableCell>
                  <TableCell className="font-mono">{c.productSlug}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={c.funnelRotulo}>{c.funnelRotulo}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={c.offerRotulo}>{c.offerRotulo}</TableCell>
                  <TableCell className="font-mono">{c.year}</TableCell>
                  <TableCell>{c.publishedAt ? <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" />sim</Badge> : <Badge variant="outline">não</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {!c.publishedAt ? (
                      <Button size="sm" variant="ghost" asChild title="Editar"><Link href={`${hrefDe("campanhas", "nova")}&editar=${c.id}`}><Pencil className="h-4 w-4" /></Link></Button>
                    ) : null}
                    <Button size="sm" variant="ghost" asChild title="Duplicar"><Link href={`${hrefDe("campanhas", "nova")}&duplicar=${c.id}`}><Files className="h-4 w-4" /></Link></Button>
                    {!c.publishedAt ? (
                      <Button size="sm" variant="ghost" title="Marcar como publicada" onClick={() => void marcar(c.id, c.name)} disabled={publicar.isPending}><Lock className="h-4 w-4" /></Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {lista.data ? <p className="text-xs text-muted-foreground">{lista.data.total} campanha{lista.data.total === 1 ? "" : "s"}{lista.data.total > 100 ? " — mostrando as 100 mais recentes; refine os filtros" : ""}.</p> : null}
    </div>
  );
}
