"use client";

/**
 * "Slug de LP" — pedido do dono do produto na validação visual (2026-09-09):
 * montar o slug (`bbe-churrasco-a01-of01-lpa`) sem passar pelo cadastro.
 * Story 47.7: virou seção própria e, ao escolher o expert, lista as LPs dele
 * (Código · Slug · URL · Descrição); cada nível seguinte da cascata estreita
 * a lista — com a combinação completa, é a lista da combinação, como antes.
 *
 * Mesma cascata e a MESMA função de slug do `shared` que a API usa; mostra o
 * próximo código livre. O botão "Cadastrar esta LP" abre o formulário da 47.2
 * já preenchido — o slug gravado é sempre o gerado pelo servidor.
 */

import { useMemo, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { erroDaApi, useListaDe, useProximoCodigo } from "@/lib/hooks/use-nomenclatura";
import { CASCATA_VAZIA, cascataCompleta, previaDeSlug, type Cascata } from "@/lib/utils/nomenclatura-cascata";
import { CascataDeSelects, FormLp } from "./forms";
import { copiarTexto } from "./previa-do-nome";

export function GeradorDeSlug({ podeEditar }: { podeEditar: boolean }) {
  const [cascata, setCascata] = useState<Cascata>(CASCATA_VAZIA);
  const [codigo, setCodigo] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const completa = cascataCompleta(cascata);
  const temExpert = Boolean(cascata.expertId);

  const experts = useListaDe("experts");
  const produtos = useListaDe("produtos", { expertId: cascata.expertId }, { enabled: temExpert });
  const funis = useListaDe("funis", { expertId: cascata.expertId }, { enabled: temExpert });
  const ofertas = useListaDe("ofertas", { expertId: cascata.expertId }, { enabled: temExpert });
  // AC4/AC5: a lista nasce com o expert e estreita com cada nível escolhido (a API aceita filtro parcial).
  const lps = useListaDe(
    "lps",
    { expertId: cascata.expertId || undefined, productId: cascata.productId || undefined, funnelId: cascata.funnelId || undefined, offerId: cascata.offerId || undefined },
    { enabled: temExpert },
  );
  const sugestao = useProximoCodigo("lps", cascata, completa);

  const expert = experts.data?.find((e) => e.id === cascata.expertId);
  const produto = produtos.data?.find((p) => p.id === cascata.productId);
  const funil = funis.data?.find((f) => f.id === cascata.funnelId);
  const oferta = ofertas.data?.find((o) => o.id === cascata.offerId);

  const codigoEfetivo = codigo || sugestao.data?.codigo || "";
  const slug = useMemo(
    () => previaDeSlug({ expert: expert?.code, produto: produto?.slug, funil: funil?.code, oferta: oferta?.code, codigo: codigoEfetivo }),
    [expert, produto, funil, oferta, codigoEfetivo],
  );

  /** O que está filtrando além do expert — para o título dizer o que a lista é. */
  const recorte = [produto?.slug, funil?.code, oferta?.code].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <div className="space-y-4">
        <div className="grid gap-3">
          <CascataDeSelects valor={cascata} onChange={(c) => { setCascata(c); setCodigo(""); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="slug-codigo">Código da LP</Label>
          <Input id="slug-codigo" value={codigoEfetivo} onChange={(e) => setCodigo(e.target.value)} placeholder="lpa" className="w-[140px] font-mono" disabled={!completa} />
          <p className="text-xs text-muted-foreground">
            {completa ? (sugestao.data?.codigo ? `Próximo livre nesta combinação: ${sugestao.data.codigo}.` : "Escolha a letra (lpa, lpb…).") : "Escolha expert, produto, funil e oferta."}
          </p>
        </div>

        {temExpert ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              LPs de <span className="font-mono">{expert?.code ?? "…"}</span>
              {recorte ? <span className="font-normal text-muted-foreground"> · {recorte}</span> : null}
            </h3>
            {lps.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : lps.error ? (
              // AC6: falha da API é erro na tela, não "nenhuma LP".
              <p className="text-sm text-destructive" role="alert">
                Não foi possível listar as LPs: {erroDaApi(lps.error).mensagem}
              </p>
            ) : (lps.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {recorte ? "Nenhuma LP cadastrada nesta combinação." : `Nenhuma LP cadastrada para ${expert?.code ?? "este expert"}.`}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Código</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...(lps.data ?? [])]
                      .sort((a, b) => a.slug.localeCompare(b.slug))
                      .map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono">{l.code}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              <code className="font-mono">{l.slug}</code>
                              {!l.active ? <span className="text-xs text-muted-foreground">(inativa)</span> : null}
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar slug" aria-label={`Copiar ${l.slug}`} onClick={() => void copiarTexto(l.slug)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            {l.url ? (
                              <a href={l.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
                                {l.url}
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate" title={l.description ?? undefined}>
                            {l.description || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-sm font-semibold">Slug</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-base">{slug ?? "…"}</code>
          <Button type="button" variant="outline" size="sm" disabled={!slug} onClick={() => slug && void copiarTexto(slug)}>
            <Copy className="mr-1 h-4 w-4" /> Copiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{slug ? `${slug.length} caracteres · ${"{expert}-{produto}-{funil}-{oferta}-{lp}"}` : "Preencha a combinação e o código."}</p>
        {podeEditar ? (
          <Button type="button" disabled={!completa} onClick={() => setCadastrando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Cadastrar esta LP
          </Button>
        ) : null}
      </aside>

      <FormLp aberto={cadastrando} linha={null} cascataInicial={completa ? cascata : undefined} onFechar={() => setCadastrando(false)} />
    </div>
  );
}
