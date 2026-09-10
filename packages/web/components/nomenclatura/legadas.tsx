"use client";

/**
 * Story 47.5 — Campanhas › Legadas: as campanhas do Meta que já rodaram no
 * perpétuo, com nome antigo, classificadas uma a uma nos nove campos.
 *
 * A fila vem da API (filtro por token + gasto + decisão + sugestão). Aqui só se
 * desenha e se abre o gerador em diálogo, pré-preenchido pela sugestão
 * traduzida para ids (`estadoDaSugestao`). "Não é perpétuo" tira da fila com
 * motivo; "Voltar para a fila" desfaz — e, se estava classificada, apaga o
 * registro (decisão do @po: legada nasce publicada, Editar fica bloqueado).
 */

import { useMemo, useState } from "react";
import { Copy, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjects } from "@/lib/hooks/use-projects";
import { erroDaApi, useDesfazerDecisao, useIgnorarLegada, useLegadas, useListaDe, type FilaDeLegadas, type Legada } from "@/lib/hooks/use-nomenclatura";
import { ROTULO_DA_FILA, estadoDaSugestao, resumoDaSugestao } from "@/lib/utils/nomenclatura-legadas";
import { GeradorDeCampanha } from "./gerador-de-campanha";
import { copiarTexto } from "./previa-do-nome";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const data = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");

export function Legadas({ podeEditar }: { podeEditar: boolean }) {
  const [projectId, setProjectId] = useState("");
  const [fila, setFila] = useState<FilaDeLegadas>("pendentes");
  const [q, setQ] = useState("");
  const projetos = useProjects();
  const lista = useLegadas({ projectId: projectId || undefined, fila, q: q.trim() || undefined });
  const ignorar = useIgnorarLegada();
  const desfazer = useDesfazerDecisao();
  const [alvo, setAlvo] = useState<Legada | null>(null);
  const TODOS = "__todos__";

  // Listas do expert do alvo, para traduzir a sugestão (códigos) em ids.
  const expertId = alvo?.expert?.id ?? "";
  const produtos = useListaDe("produtos", { expertId }, { enabled: Boolean(expertId) });
  const funis = useListaDe("funis", { expertId }, { enabled: Boolean(expertId) });
  const ofertas = useListaDe("ofertas", { expertId }, { enabled: Boolean(expertId) });
  const lps = useListaDe("lps", { expertId }, { enabled: Boolean(expertId) });
  const inicial = useMemo(
    () =>
      alvo && alvo.expert
        ? estadoDaSugestao(alvo.sugestao, alvo.expert.id, { produtos: produtos.data ?? [], funis: funis.data ?? [], ofertas: ofertas.data ?? [], lps: lps.data ?? [] })
        : null,
    [alvo, produtos.data, funis.data, ofertas.data, lps.data],
  );
  const prontoParaAbrir = Boolean(alvo && inicial && !produtos.isLoading && !funis.isLoading && !ofertas.isLoading && !lps.isLoading);

  async function naoEhPerpetuo(l: Legada) {
    const reason = prompt(`Tirar "${l.nome}" da fila. Motivo (opcional):`) ?? undefined;
    if (reason === undefined && !confirm("Tirar da fila sem motivo?")) return;
    try {
      await ignorar.mutateAsync({ projectId: l.projectId, campaignId: l.campaignId, reason: reason || undefined });
      toast.success("Fora da fila. Reversível em \"Não é perpétuo\".");
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  }

  async function voltar(l: Legada) {
    const classificada = l.decisao?.tipo === "classificada";
    if (classificada && !confirm("Voltar para a fila APAGA a classificação desta campanha (o registro em Campanhas some). Continuar?")) return;
    try {
      await desfazer.mutateAsync({ projectId: l.projectId, campaignId: l.campaignId });
      toast.success("De volta à fila.");
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="l-proj" className="text-xs text-muted-foreground">Projeto</Label>
          <Select value={projectId || TODOS} onValueChange={(v) => setProjectId(v === TODOS ? "" : v)}>
            <SelectTrigger id="l-proj" className="min-w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os projetos</SelectItem>
              {(projetos.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="l-fila" className="text-xs text-muted-foreground">Fila</Label>
          <Select value={fila} onValueChange={(v) => setFila(v as FilaDeLegadas)}>
            <SelectTrigger id="l-fila" className="min-w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ROTULO_DA_FILA) as FilaDeLegadas[]).map((f) => <SelectItem key={f} value={f}>{ROTULO_DA_FILA[f]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor="l-q" className="text-xs text-muted-foreground">Buscar no nome antigo</Label>
          <Input id="l-q" value={q} onChange={(e) => setQ(e.target.value)} className="font-mono" />
        </div>
        {lista.data ? (
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{lista.data.resumo.pendentes}</strong> pendente{lista.data.resumo.pendentes === 1 ? "" : "s"} · {brl(lista.data.resumo.gastoPendente)} sem classificação · {lista.data.resumo.total} no filtro
          </p>
        ) : null}
      </div>

      {lista.error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erroDaApi(lista.error).mensagem}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome antigo (Meta)</TableHead>
              <TableHead>Projeto / expert</TableHead>
              <TableHead className="text-right">Gasto</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Sugestão</TableHead>
              <TableHead>Status</TableHead>
              {podeEditar ? <TableHead className="text-right">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading ? (
              [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
            ) : (lista.data?.itens.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Nada nesta fila.</TableCell></TableRow>
            ) : (
              lista.data!.itens.map((l) => {
                const r = resumoDaSugestao(l.sugestao);
                return (
                  <TableRow key={`${l.projectId}:${l.campaignId}`}>
                    <TableCell className="max-w-[360px]">
                      <span className="inline-flex items-center gap-1">
                        <code className="break-all font-mono text-xs">{l.nome}</code>
                        <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" title="Copiar" onClick={() => void copiarTexto(l.nome)}><Copy className="h-3.5 w-3.5" /></Button>
                      </span>
                      {l.statusMeta ? <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l.statusMeta}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {l.projeto}
                      <div className="text-xs">{l.expert ? <span className="font-mono">{l.expert.code}</span> : <span className="text-warning">sem expert — vincule em Experts</span>}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.gasto ? brl(l.gasto) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{l.de ? `${data(l.de)} → ${data(l.ate)}` : "sem gasto no histórico"}</TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      <div className="font-mono">{r.achou}</div>
                      {r.faltou ? <div className="text-muted-foreground">falta: {r.faltou}</div> : null}
                    </TableCell>
                    <TableCell>
                      {l.decisao?.tipo === "classificada" ? <Badge variant="secondary">classificada</Badge> : l.decisao?.tipo === "ignorada" ? <Badge variant="outline" title={l.decisao.reason ?? ""}>não é perpétuo</Badge> : <Badge variant="outline">pendente</Badge>}
                    </TableCell>
                    {podeEditar ? (
                      <TableCell className="whitespace-nowrap text-right">
                        <span className="inline-flex gap-1">
                          {!l.decisao ? (
                            <>
                              <Button size="sm" onClick={() => setAlvo(l)} disabled={!l.expert} title={l.expert ? undefined : "Vincule o expert ao projeto em Dicionário › Experts"}>Classificar</Button>
                              <Button size="sm" variant="outline" onClick={() => void naoEhPerpetuo(l)} disabled={ignorar.isPending}>Não é perpétuo</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void voltar(l)} disabled={desfazer.isPending}><Undo2 className="mr-1 h-3.5 w-3.5" />Voltar para a fila</Button>
                          )}
                        </span>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(alvo)} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Classificar campanha legada</DialogTitle>
          </DialogHeader>
          {alvo && alvo.expert ? (
            prontoParaAbrir && inicial ? (
              <GeradorDeCampanha
                key={`${alvo.projectId}:${alvo.campaignId}`}
                modo={{ tipo: "legada", projectId: alvo.projectId, campaignId: alvo.campaignId, nomeAntigo: alvo.nome, inicial, onSalvo: () => setAlvo(null) }}
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o dicionário de {alvo.expert.code}…</p>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
