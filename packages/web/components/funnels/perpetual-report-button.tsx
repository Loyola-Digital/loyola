"use client";

/**
 * Story 41.9 — botão do relatório perpétuo + histórico.
 *
 * Duas decisões de leitura da tela:
 *
 * 1. O estado bloqueado aparece ANTES do clique (AC6). O botão não pode ser a
 *    primeira notícia de que o funil não foi validado — quem chega aqui já vê
 *    que falta validar e por quê.
 * 2. Erro de invariante não vira toast que some. Ele fica na tela, com o código,
 *    o detalhe e a ação, porque é exatamente o caso em que o usuário precisa ir
 *    consertar alguma coisa antes de tentar de novo.
 */

import { useState } from "react";
import { FileText, Loader2, ShieldAlert, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePerpetualReports,
  useGeneratePerpetualReport,
  usePerpetualReportHtml,
  type PerpetualReportErro,
} from "@/lib/hooks/use-perpetual-report";
import { usePerpetualReportConfig } from "@/lib/hooks/use-perpetual-report-config";

interface Props {
  projectId: string;
  funnelId: string;
}

const fmtBRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** `2026-07-27` → `27/07`. */
const dataCurta = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export function PerpetualReportButton({ projectId, funnelId }: Props) {
  const { data: config } = usePerpetualReportConfig(projectId, funnelId);
  const { data: lista } = usePerpetualReports(projectId, funnelId);
  const gerar = useGeneratePerpetualReport(projectId, funnelId);

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState<PerpetualReportErro | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const { data: aberto } = usePerpetualReportHtml(projectId, funnelId, abertoId);
  const bloqueado = !!config?.bloqueio;

  function handleGerar() {
    setErro(null);
    gerar.mutate(
      { dataInicio: inicio || null, dataFim: fim || null },
      {
        onSuccess: (res) => {
          setAbertoId(res.id);
          toast.success("Relatório gerado");
        },
        onError: (e: unknown) => {
          const body = (e as { body?: PerpetualReportErro })?.body;
          if (body?.erro) setErro(body);
          else toast.error("Não foi possível gerar o relatório");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          Relatório do funil perpétuo
        </h3>
        <p className="text-xs text-muted-foreground">
          Gera um retrato do período com margem, CAC, ponto de equilíbrio e leituras do dado.
        </p>
      </div>

      {/* Estado do gate ANTES do botão (AC6) */}
      {bloqueado && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-red-500">
            <ShieldAlert className="h-4 w-4" />
            Relatório bloqueado — funil não validado
          </p>
          <p className="text-xs text-muted-foreground">{config!.bloqueio!.detalhe}</p>
          <p className="text-xs text-muted-foreground">{config!.bloqueio!.acao}</p>
        </div>
      )}

      <div className="rounded-xl border border-border/60 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Início (opcional)</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim (opcional)</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Em branco, usa do dia 1 do mês até <strong>ontem</strong> — o relatório só conta dias
          completos, então vendas de hoje ficam fora.
        </p>

        <Button size="sm" onClick={handleGerar} disabled={bloqueado || gerar.isPending}>
          {gerar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Gerar relatório
        </Button>
      </div>

      {/* Erro do §C.8 fica na tela — o usuário precisa agir sobre ele */}
      {erro && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            {erro.erro === "INVARIANTE_VIOLADO"
              ? `Os números não fecham (${erro.codigo})`
              : erro.erro === "DADO_INDISPONIVEL"
                ? "Falta dado para gerar"
                : "Funil não validado"}
          </p>
          <p className="text-xs text-muted-foreground">{erro.detalhe}</p>
          <p className="text-xs text-muted-foreground">
            <strong>O que fazer:</strong> {erro.acao}
          </p>
        </div>
      )}

      {/* Histórico */}
      {lista && lista.reports.length > 0 && (
        <div className="rounded-xl border border-border/60 p-4 space-y-2">
          <p className="text-sm font-medium">Relatórios gerados</p>
          <div className="space-y-1">
            {lista.reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setAbertoId(r.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  abertoId === r.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <span>
                  {dataCurta(r.dataInicio)} a {dataCurta(r.dataFim)}
                  <span className="ml-2 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">{r.metricas.vendas} vendas</span>
                  <span className={r.metricas.margem >= 0 ? "text-emerald-600" : "text-red-500"}>
                    {fmtBRL(r.metricas.margem)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render em iframe sandbox — mesmo padrão da aba Sprint */}
      {aberto?.html && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {dataCurta(aberto.dataInicio)} a {dataCurta(aberto.dataFim)}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(aberto.html);
                  w.document.close();
                }
              }}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Abrir em nova aba
            </Button>
          </div>
          <iframe
            title="Relatório perpétuo"
            srcDoc={aberto.html}
            sandbox=""
            className="h-[70vh] w-full rounded-xl border border-border/60 bg-white"
          />
        </div>
      )}
    </div>
  );
}
