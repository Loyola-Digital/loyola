"use client";

/**
 * Story 41.6 — botão "Gerar Comparativo" + diálogo de seleção do lado B (§AC7).
 *
 * O lado A é sempre a etapa em que o usuário está; o diálogo escolhe o B
 * (projeto → funil → etapa, com período opcional).
 *
 * Decisões de tela:
 *
 * 1. O erro 422 **identifica qual lado** falhou e fica na tela. Violação em um
 *    lado aborta os dois (§9.2), então o usuário precisa saber onde mexer.
 * 2. O botão não é desabilitado pelo gate do lado A — o gate roda no servidor
 *    para os dois lados, e desabilitar aqui esconderia que o problema pode estar
 *    no B.
 * 3. Não há seletor de projeto: comparar entre projetos é possível pela API, mas
 *    a lista de etapas de outro expert não ajuda quem está olhando este.
 */

import { useState } from "react";
import { AlertTriangle, ExternalLink, GitCompare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFunnels } from "@/lib/hooks/use-funnels";
import { useFunnelStages } from "@/lib/hooks/use-funnel-stages";
import {
  useGenerateComparativo,
  type ComparativoErro,
} from "@/lib/hooks/use-launch-reports";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

const PASSOS = [
  "Carregando o lançamento A…",
  "Carregando o lançamento B…",
  "Validando invariantes dos dois lados…",
  "Decompondo o ROAS…",
];

export function LaunchComparativoButton({ projectId, funnelId, stageId }: Props) {
  const gerar = useGenerateComparativo(projectId);

  const [bFunnelId, setBFunnelId] = useState<string>("");
  const [bStageId, setBStageId] = useState<string>("");
  const [bInicio, setBInicio] = useState("");
  const [bFim, setBFim] = useState("");
  const [erro, setErro] = useState<ComparativoErro | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  const { data: funis } = useFunnels(projectId);
  const { data: etapasB } = useFunnelStages(projectId, bFunnelId || null);

  // O próprio lançamento não pode ser o lado B — comparar A com A não diz nada.
  const etapasDisponiveis = (etapasB ?? []).filter((e) => e.id !== stageId);

  function handleGerar() {
    setErro(null);
    if (!bFunnelId || !bStageId) {
      toast.error("Escolha o funil e a etapa do segundo lançamento");
      return;
    }
    gerar.mutate(
      {
        a: { funnelId, stageId },
        b: {
          funnelId: bFunnelId,
          stageId: bStageId,
          dataInicio: bInicio || null,
          dataFim: bFim || null,
        },
      },
      {
        onSuccess: (res) => {
          setHtml(res.html ?? null);
          toast.success("Comparativo gerado");
        },
        onError: (e: unknown) => {
          const body = (e as { body?: ComparativoErro })?.body;
          if (body?.erro) setErro(body);
          else toast.error("Não foi possível gerar o Comparativo");
        },
      },
    );
  }

  function abrirNovaAba(doc: string) {
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const tituloErro =
    erro?.erro === "INVARIANTE_VIOLADO"
      ? `Os números não fecham no lado ${erro.lado?.toUpperCase() ?? "?"} (${erro.codigo})`
      : erro?.erro === "DADO_INDISPONIVEL"
        ? `Falta dado no lado ${erro?.lado?.toUpperCase() ?? "?"}`
        : erro?.erro === "CONFERENCIA_EXTERNA"
          ? `Investimento diverge do oficial no lado ${erro?.lado?.toUpperCase() ?? "?"}`
          : `Combinação não validada no lado ${erro?.lado?.toUpperCase() ?? "?"}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GitCompare className="h-4 w-4 text-primary" />
          Comparativo com outro lançamento
        </h3>
        <p className="text-xs text-muted-foreground">
          Decompõe a diferença de ROAS em CPM, CTR, conversão e ticket — mostrando quanto de
          cada fator explica a variação, e simulando cenários com a mídia trocada entre os dois.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Funil do segundo lançamento</Label>
            <Select
              value={bFunnelId}
              onValueChange={(v) => {
                setBFunnelId(v);
                setBStageId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolher funil" />
              </SelectTrigger>
              <SelectContent>
                {(funis ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Etapa</Label>
            <Select value={bStageId} onValueChange={setBStageId} disabled={!bFunnelId}>
              <SelectTrigger>
                <SelectValue placeholder={bFunnelId ? "Escolher etapa" : "Escolha o funil antes"} />
              </SelectTrigger>
              <SelectContent>
                {etapasDisponiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Início do B (opcional)</Label>
            <Input type="date" value={bInicio} onChange={(e) => setBInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim do B (opcional)</Label>
            <Input type="date" value={bFim} onChange={(e) => setBFim(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Os dois lados passam pelo gate e pelos invariantes. Violação em qualquer um aborta a
          geração inteira — um comparativo com um lado inconsistente parece confiável e não é.
        </p>

        <Button size="sm" onClick={handleGerar} disabled={gerar.isPending}>
          {gerar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Gerar Comparativo
        </Button>
        {gerar.isPending && <p className="text-[11px] text-muted-foreground">{PASSOS[0]}</p>}
      </div>

      {erro && (
        <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            {tituloErro}
          </p>
          <p className="text-xs text-muted-foreground">{erro.detalhe}</p>
          <p className="text-xs text-muted-foreground">
            <strong>O que fazer:</strong> {erro.acao}
          </p>
        </div>
      )}

      {html && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Comparativo gerado</p>
            <Button size="sm" variant="outline" onClick={() => abrirNovaAba(html)}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Nova aba
            </Button>
          </div>
          {/* Mesmo sandbox do Resumão: scripts sim, same-origin NÃO. */}
          <iframe
            title="Comparativo"
            srcDoc={html}
            sandbox="allow-scripts"
            className="h-[75vh] w-full rounded-xl border border-border/60 bg-white"
          />
        </div>
      )}
    </div>
  );
}
