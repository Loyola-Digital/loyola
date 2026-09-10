"use client";

/**
 * Story 47.10 — listagem de anúncios: estrutura (mono, copiar), descrição,
 * expert, tipo, sigla+NN, data, criado em; filtros por expert, tipo, sigla e
 * período; busca no nome. Ações: Editar (descrição, notas, lançamento, data
 * — não o NN nem o tipo, D23) e Duplicar (próximo NN).
 */

import { useState } from "react";
import Link from "next/link";
import { Copy, Files, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { erroDaApi, useAnuncios, useListaDe } from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import { mesAnoDe } from "@/lib/utils/nomenclatura-anuncio";
import { copiarTexto } from "../previa-do-nome";
import { SeletorDeExpert } from "../seletor-de-expert";

const TODOS = "__todos__";

export function ListaDeAnuncios() {
  const [expertId, setExpertId] = useState("");
  const [creativeType, setCreativeType] = useState("");
  const [launchType, setLaunchType] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [q, setQ] = useState("");
  const tipos = useListaDe("dicionario", { type: "creative_type", inativos: true });
  const siglas = useListaDe("dicionario", { type: "launch_type", inativos: true });
  const paraMmAaaa = (mes: string) => (mes ? `${mes.slice(5, 7)}-${mes.slice(0, 4)}` : undefined);
  const lista = useAnuncios({ expertId: expertId || undefined, creativeType: creativeType || undefined, launchType: launchType || undefined, de: paraMmAaaa(de), ate: paraMmAaaa(ate), q: q.trim() || undefined, limit: 100 });

  const filtro = (id: string, label: string, valor: string, onChange: (v: string) => void, opcoes: { value: string; description: string | null }[]) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={valor || TODOS} onValueChange={(v) => onChange(v === TODOS ? "" : v)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.description ? `${o.value} — ${o.description}` : o.value}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{lista.data ? `${lista.data.total} anúncio${lista.data.total === 1 ? "" : "s"}` : ""}</p>
        <Button asChild>
          <Link href={hrefDe("ads", "novo")}><Plus className="mr-1 h-4 w-4" /> Novo anúncio</Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SeletorDeExpert valor={expertId} onChange={setExpertId} permitirTodos id="f-ad-expert" />
        {filtro("f-ad-tipo", "Tipo", creativeType, setCreativeType, tipos.data ?? [])}
        {filtro("f-ad-sigla", "Sigla", launchType, setLaunchType, siglas.data ?? [])}
        <div className="space-y-1">
          <Label htmlFor="f-ad-de" className="text-xs text-muted-foreground">De (mês)</Label>
          <Input id="f-ad-de" type="month" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-ad-ate" className="text-xs text-muted-foreground">Até (mês)</Label>
          <Input id="f-ad-ate" type="month" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-ad-q" className="text-xs text-muted-foreground">Buscar no nome</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="f-ad-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="adv03_dg…" className="pl-8 font-mono" />
          </div>
        </div>
      </div>

      {lista.error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erroDaApi(lista.error).mensagem}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estrutura</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Expert</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Lançamento</TableHead>
              <TableHead>Mês</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading ? (
              [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
            ) : (lista.data?.itens.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Nenhum anúncio ainda. <Link className="underline" href={hrefDe("ads", "novo")}>Criar o primeiro</Link>.</TableCell></TableRow>
            ) : (
              lista.data!.itens.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-sm">{a.structure}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar estrutura" onClick={() => void copiarTexto(a.structure)}><Copy className="h-3.5 w-3.5" /></Button>
                      {a.description ? <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" title="Copiar nome completo" onClick={() => void copiarTexto(a.name)}>completo</Button> : null}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-sm" title={a.description ?? undefined}>{a.description || "—"}</TableCell>
                  <TableCell className="font-mono">{a.expertCode}</TableCell>
                  <TableCell className="font-mono">{a.creativeType}{String(a.creativeSeq).padStart(2, "0")}</TableCell>
                  <TableCell className="font-mono">{a.launchType}{String(a.launchSeq).padStart(2, "0")}</TableCell>
                  <TableCell className="font-mono">{mesAnoDe(a.adDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("ads", "novo")}&editar=${a.id}`}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("ads", "novo")}&duplicar=${a.id}`}><Files className="mr-1 h-3.5 w-3.5" />Duplicar</Link></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {lista.data && lista.data.total > 100 ? <p className="text-xs text-muted-foreground">Mostrando os 100 mais recentes — refine os filtros.</p> : null}
    </div>
  );
}
