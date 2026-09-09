"use client";

/**
 * "Slug de LP" — pedido do dono do produto na validação visual (2026-09-09):
 * montar o slug (`bbe-churrasco-a01-of01-lpa`) sem passar pelo cadastro.
 *
 * Mesma cascata e a MESMA função de slug do `shared` que a API usa; mostra as
 * LPs já cadastradas na combinação (com copiar) e o próximo código livre. O
 * botão "Cadastrar esta LP" abre o formulário da 47.2 já preenchido — o slug
 * gravado é sempre o gerado pelo servidor.
 */

import { useMemo, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useListaDe, useProximoCodigo } from "@/lib/hooks/use-nomenclatura";
import { CASCATA_VAZIA, cascataCompleta, previaDeSlug, type Cascata } from "@/lib/utils/nomenclatura-cascata";
import { CascataDeSelects, FormLp } from "./forms";
import { copiarTexto } from "./previa-do-nome";

export function GeradorDeSlug({ podeEditar }: { podeEditar: boolean }) {
  const [cascata, setCascata] = useState<Cascata>(CASCATA_VAZIA);
  const [codigo, setCodigo] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const completa = cascataCompleta(cascata);

  const experts = useListaDe("experts");
  const produtos = useListaDe("produtos", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });
  const funis = useListaDe("funis", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });
  const ofertas = useListaDe("ofertas", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });
  const lps = useListaDe("lps", cascata, { enabled: completa });
  const sugestao = useProximoCodigo("lps", cascata, completa);

  const codigoEfetivo = codigo || sugestao.data?.codigo || "";
  const slug = useMemo(
    () =>
      previaDeSlug({
        expert: experts.data?.find((e) => e.id === cascata.expertId)?.code,
        produto: produtos.data?.find((p) => p.id === cascata.productId)?.slug,
        funil: funis.data?.find((f) => f.id === cascata.funnelId)?.code,
        oferta: ofertas.data?.find((o) => o.id === cascata.offerId)?.code,
        codigo: codigoEfetivo,
      }),
    [experts.data, produtos.data, funis.data, ofertas.data, cascata, codigoEfetivo],
  );

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
        {completa ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">LPs já cadastradas nesta combinação</h3>
            {(lps.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
            ) : (
              <ul className="space-y-1">
                {(lps.data ?? []).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <code className="font-mono">{l.slug}</code>
                    {!l.active ? <span className="text-xs text-muted-foreground">(inativa)</span> : null}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar" onClick={() => void copiarTexto(l.slug)}><Copy className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
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
