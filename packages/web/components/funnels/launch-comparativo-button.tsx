"use client";

/**
 * Story 41.6 — botão "Gerar Comparativo" + seleção do lançamento anterior (§AC7).
 *
 * ⚠️ **A etapa atual é o lado B, não o A.** A decomposição responde "como
 * chegamos até aqui", então ela vai do lançamento **anterior** (A, ponto de
 * partida) para o **atual** (B, destino) — que é a mesma direção da §10, onde a
 * decomposição é PG02 (abril) → PG04 (julho).
 *
 * Inverter isso não seria só um rótulo trocado: os ratios virariam o recíproco,
 * os pesos mudariam de sinal e o relatório diria que ajudou o que puxou pra
 * baixo. Por isso o seletor pede o **lançamento anterior** e ele entra como A.
 *
 * Decisões de tela:
 *
 * 1. O erro 422 identifica o lado, e a tela traduz `a` e `b` para "lançamento
 *    anterior" e "lançamento atual" — "lado A" não diz nada para quem olha.
 * 2. O botão não é desabilitado pelo gate da etapa atual — o gate roda no
 *    servidor para os dois lados, e desabilitar aqui esconderia que o problema
 *    pode estar no lançamento anterior.
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
  "Carregando o lançamento anterior…",
  "Carregando o lançamento atual…",
  "Validando invariantes dos dois lados…",
  "Decompondo o ROAS…",
];

/** `a`/`b` não dizem nada na tela — o usuário pensa em anterior e atual. */
const NOME_DO_LADO: Record<string, string> = { a: "lançamento anterior", b: "lançamento atual" };

export function LaunchComparativoButton({ projectId, funnelId, stageId }: Props) {
  const gerar = useGenerateComparativo(projectId);

  const [antFunnelId, setAntFunnelId] = useState<string>("");
  const [antStageId, setAntStageId] = useState<string>("");
  const [antInicio, setAntInicio] = useState("");
  const [antFim, setAntFim] = useState("");
  const [erro, setErro] = useState<ComparativoErro | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  const { data: funis } = useFunnels(projectId);
  const { data: etapasAnterior } = useFunnelStages(projectId, antFunnelId || null);

  // A própria etapa não pode ser o lançamento anterior — comparar com si mesma
  // daria ratios 1 e uma decomposição sem informação.
  const etapasDisponiveis = (etapasAnterior ?? []).filter((e) => e.id !== stageId);

  function handleGerar() {
    setErro(null);
    if (!antFunnelId || !antStageId) {
      toast.error("Escolha o funil e a etapa do lançamento anterior");
      return;
    }
    gerar.mutate(
      {
        // A = anterior (de onde viemos), B = atual (onde estamos).
        a: {
          funnelId: antFunnelId,
          stageId: antStageId,
          dataInicio: antInicio || null,
          dataFim: antFim || null,
        },
        b: { funnelId, stageId },
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

  const ondeFalhou = erro?.lado ? ` no ${NOME_DO_LADO[erro.lado] ?? erro.lado}` : "";
  const tituloErro =
    erro?.erro === "INVARIANTE_VIOLADO"
      ? `Os números não fecham${ondeFalhou} (${erro.codigo})`
      : erro?.erro === "DADO_INDISPONIVEL"
        ? `Falta dado${ondeFalhou}`
        : erro?.erro === "CONFERENCIA_EXTERNA"
          ? `Investimento diverge do oficial${ondeFalhou}`
          : `Combinação não validada${ondeFalhou}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GitCompare className="h-4 w-4 text-primary" />
          Comparativo com outro lançamento
        </h3>
        <p className="text-xs text-muted-foreground">
          Compara <strong>este lançamento</strong> com um anterior e decompõe a diferença de ROAS
          em CPM, CTR, conversão e ticket — mostrando quanto de cada fator explica a variação, e
          simulando cenários com a mídia trocada entre os dois.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Funil do lançamento anterior</Label>
            <Select
              value={antFunnelId}
              onValueChange={(v) => {
                setAntFunnelId(v);
                setAntStageId("");
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
            <Label className="text-xs">Etapa do lançamento anterior</Label>
            <Select value={antStageId} onValueChange={setAntStageId} disabled={!antFunnelId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={antFunnelId ? "Escolher etapa" : "Escolha o funil antes"}
                />
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
            <Label className="text-xs">Início do anterior (opcional)</Label>
            <Input type="date" value={antInicio} onChange={(e) => setAntInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim do anterior (opcional)</Label>
            <Input type="date" value={antFim} onChange={(e) => setAntFim(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A leitura vai do lançamento anterior para <strong>este</strong>: o relatório responde o
          que mudou até aqui. Os dois lados passam pelo gate e pelos invariantes, e violação em
          qualquer um aborta a geração inteira — um comparativo com um lado inconsistente parece
          confiável e não é.
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
