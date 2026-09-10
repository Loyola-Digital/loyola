"use client";

/**
 * Story 47.3 — listagem de campanhas (spec § 7, último bloco): nome mono com
 * copiar, expert, produto, funil, oferta, ano, publicada, criada em; filtros e
 * busca vão para a API; ações Editar (se não publicada), Duplicar, Marcar como
 * publicada.
 */

import { useState } from "react";
import Link from "next/link";
import { Copy, Pencil, Files, Link2, Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { erroDaApi, useCampanhas, useEditarCampanha, useListaDe, usePublicarCampanha } from "@/lib/hooks/use-nomenclatura";
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
  const editar = useEditarCampanha();
  const TODOS = "__todos__";

  /**
   * Story 47.6 (AC5): sem o id da Meta a campanha do gerador não entra no
   * cruzamento — o mapa é chaveado por id. Colar aqui é o que liga as duas
   * pontas; `metaCampaignId` é editável mesmo em campanha publicada.
   */
  async function colarIdDaMeta(id: string, name: string, atual: string | null) {
    const v = prompt(`Id da campanha na Meta para\n${name}\n(o número que aparece no Gerenciador de Anúncios):`, atual ?? "");
    if (v === null) return;
    const limpo = v.trim();
    if (limpo && !/^\d{6,40}$/.test(limpo)) {
      toast.error("O id da Meta é só dígitos (ex.: 120212345678901234).");
      return;
    }
    try {
      await editar.mutateAsync({ id, dados: { metaCampaignId: limpo || null } });
      toast.success(limpo ? "Id da Meta colado — a campanha entra no cruzamento." : "Id da Meta removido.");
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  }

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
      {/* Validação visual do dono do produto (2026-09-09): "não aparece o botão de
          adicionar nova campanha". A sub-aba não bastava como caminho. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{lista.data ? `${lista.data.total} campanha${lista.data.total === 1 ? "" : "s"}` : ""}</p>
        <Button asChild>
          <Link href={hrefDe("campanhas", "nova")}>
            <Plus className="mr-1 h-4 w-4" /> Nova campanha
          </Link>
        </Button>
      </div>
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
              <TableHead>Id Meta</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading ? (
              [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
            ) : (lista.data?.itens.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">Nenhuma campanha ainda. <Link className="underline" href={hrefDe("campanhas", "nova")}>Criar a primeira</Link>.</TableCell></TableRow>
            ) : (
              lista.data!.itens.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-sm">{c.name}</code>
                      {c.origin === "legado" ? <Badge variant="outline" title={c.metaCampaignName ? `No Meta: ${c.metaCampaignName}` : undefined}>legado</Badge> : null}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar nome" onClick={() => void copiarTexto(c.name)}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{c.expertCode}</TableCell>
                  <TableCell className="font-mono">{c.productSlug}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={c.funnelRotulo}>{c.funnelRotulo}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={c.offerRotulo}>{c.offerRotulo}</TableCell>
                  <TableCell className="font-mono">{c.year}</TableCell>
                  <TableCell>{c.publishedAt ? <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" />sim</Badge> : <Badge variant="outline">não</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.metaCampaignId ? (
                      <button type="button" className="font-mono text-xs underline-offset-2 hover:underline" title="Trocar o id da Meta" onClick={() => void colarIdDaMeta(c.id, c.name, c.metaCampaignId)}>{c.metaCampaignId}</button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-warning" title="Sem id da Meta esta campanha não entra no cruzamento" onClick={() => void colarIdDaMeta(c.id, c.name, null)}><Link2 className="mr-1 h-3 w-3" />colar id</Button>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {/* Botões com texto e borda: os ícones "ghost" pareciam desabilitados (validação visual). */}
                    <span className="inline-flex gap-1">
                      {!c.publishedAt ? (
                        <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("campanhas", "nova")}&editar=${c.id}`}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Link></Button>
                      ) : null}
                      <Button size="sm" variant="outline" asChild><Link href={`${hrefDe("campanhas", "nova")}&duplicar=${c.id}`}><Files className="mr-1 h-3.5 w-3.5" />Duplicar</Link></Button>
                      {!c.publishedAt ? (
                        <Button size="sm" variant="outline" onClick={() => void marcar(c.id, c.name)} disabled={publicar.isPending}><Lock className="mr-1 h-3.5 w-3.5" />Publicar</Button>
                      ) : null}
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
