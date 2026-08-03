"use client";

/**
 * Story 41.5 — botão "Gerar Resumão" + viewer + histórico (§9.3).
 *
 * Três decisões de leitura da tela, herdadas do botão do perpétuo (41.9):
 *
 * 1. O estado **bloqueado aparece antes do clique**. O botão não pode ser a
 *    primeira notícia de que a combinação não foi validada.
 * 2. Erro de invariante **não vira toast que some**: fica na tela com código,
 *    detalhe e ação, porque é o caso em que o usuário precisa ir consertar algo.
 * 3. Durante a geração, mostra o **passo atual** — a geração cruza planilha,
 *    Meta e pesquisa, e um spinner mudo parece travado.
 *
 * ⚠️ Diferença deliberada em relação ao perpétuo: aqui o iframe usa
 * `sandbox="allow-scripts"`. O Resumão tem Chart.js e sub-abas, que não rodam
 * com `sandbox=""`. **`allow-same-origin` fica de fora de propósito** — juntas,
 * as duas flags anulam o sandbox e o relatório passaria a enxergar cookies e API
 * do app.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Download, ExternalLink, FileBarChart, Loader2, ShieldAlert, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useLaunchReports,
  useGenerateResumao,
  useLaunchReportHtml,
  useDeleteLaunchReport,
  type LaunchReportErro,
} from "@/lib/hooks/use-launch-reports";
import { useLaunchReportConfig } from "@/lib/hooks/use-launch-report-config";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

/** Passos exibidos durante a geração (§AC7). */
const PASSOS = [
  "Lendo a planilha de vendas…",
  "Reconciliando investimento…",
  "Cruzando pesquisa…",
  "Validando invariantes…",
  "Montando o relatório…",
];

const dataCurta = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";

export function LaunchReportButton({ projectId, funnelId, stageId }: Props) {
  const { data: config } = useLaunchReportConfig(projectId, funnelId, stageId);
  const { data: lista } = useLaunchReports(projectId, funnelId, stageId);
  const gerar = useGenerateResumao(projectId, funnelId, stageId);
  const excluir = useDeleteLaunchReport(projectId, funnelId, stageId);

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [oficial, setOficial] = useState("");
  const [erro, setErro] = useState<LaunchReportErro | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);

  const { data: aberto } = useLaunchReportHtml(projectId, funnelId, stageId, abertoId);
  const bloqueado = !!config?.bloqueio;

  // Passos rodam enquanto a mutation está pendente. É indicação de progresso,
  // não medição real — mas dizer "cruzando pesquisa" é mais honesto do que um
  // spinner mudo numa operação que leva alguns segundos.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (gerar.isPending) {
      setPasso(0);
      timer.current = setInterval(() => {
        setPasso((p) => (p + 1 < PASSOS.length ? p + 1 : p));
      }, 1200);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [gerar.isPending]);

  function handleGerar() {
    setErro(null);
    const investimentoOficial = oficial.trim()
      ? Number(oficial.replace(/\./g, "").replace(",", "."))
      : null;
    if (oficial.trim() && !Number.isFinite(investimentoOficial)) {
      toast.error("Investimento oficial inválido");
      return;
    }

    gerar.mutate(
      { dataInicio: inicio || null, dataFim: fim || null, investimentoOficial },
      {
        onSuccess: (res) => {
          setAbertoId(res.id);
          toast.success("Resumão gerado");
        },
        onError: (e: unknown) => {
          const body = (e as { body?: LaunchReportErro })?.body;
          if (body?.erro) setErro(body);
          else toast.error("Não foi possível gerar o Resumão");
        },
      },
    );
  }

  /**
   * Abre em nova aba via Blob — não `document.write`, que herdaria a origem do
   * app. O `revokeObjectURL` em 60s solta a memória sem cortar o carregamento.
   */
  function abrirNovaAba(html: string) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function baixar(html: string, titulo: string) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${titulo.replace(/[^\w\-. ]+/g, "_").slice(0, 120)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const tituloErro =
    erro?.erro === "INVARIANTE_VIOLADO"
      ? `Os números não fecham (${erro.codigo})`
      : erro?.erro === "DADO_INDISPONIVEL"
        ? "Falta dado para gerar"
        : erro?.erro === "CONFERENCIA_EXTERNA"
          ? "Investimento diverge do oficial"
          : "Combinação não validada";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileBarChart className="h-4 w-4 text-primary" />
          Resumão do lançamento
        </h3>
        <p className="text-xs text-muted-foreground">
          Gera um retrato do período com ROAS por origem, qualificação, order bump e destaques
          por criativo — com os invariantes conferidos antes de renderizar.
        </p>
      </div>

      {/* Estado do gate ANTES do botão (§9.3) */}
      {bloqueado && (
        <div className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-red-500">
            <ShieldAlert className="h-4 w-4" />
            Resumão bloqueado — combinação não validada
          </p>
          <p className="text-xs text-muted-foreground">{config!.bloqueio!.detalhe}</p>
          <p className="text-xs text-muted-foreground">{config!.bloqueio!.acao}</p>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Início (opcional)</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim (opcional)</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Investimento oficial (opcional)</Label>
            <Input
              inputMode="decimal"
              placeholder="126566,14"
              value={oficial}
              onChange={(e) => setOficial(e.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Em branco, o período vem da configuração da etapa. O investimento oficial, quando
          informado, é conferido contra o calculado — diferença acima de 0,5% bloqueia a geração.
        </p>

        <Button size="sm" onClick={handleGerar} disabled={bloqueado || gerar.isPending}>
          {gerar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Gerar Resumão
        </Button>
        {gerar.isPending && (
          <p className="text-[11px] text-muted-foreground">{PASSOS[passo]}</p>
        )}
      </div>

      {/* Erro do §9.1 fica na tela — o usuário precisa agir sobre ele */}
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
          {erro.violacoes && erro.violacoes.length > 1 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {erro.violacoes.slice(1).map((v) => (
                <li key={v.codigo}>
                  <strong>{v.codigo}</strong> — {v.detalhe}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Histórico */}
      {lista && lista.reports.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border/60 p-4">
          <p className="text-sm font-medium">Relatórios gerados</p>
          <div className="space-y-1">
            {lista.reports.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${
                  abertoId === r.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <button className="flex-1 text-left" onClick={() => setAbertoId(r.id)}>
                  <span className="font-medium">
                    {r.kind === "comparativo" ? "Comparativo" : "Resumão"}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {dataCurta(r.dataInicio)} a {dataCurta(r.dataFim)}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    · gerado em {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  {r.alertas && r.alertas.length > 0 && (
                    <span className="ml-2 text-amber-600">
                      {r.alertas.length}{" "}
                      {r.alertas.length === 1 ? "sinalização" : "sinalizações"}
                    </span>
                  )}
                </button>
                <button
                  aria-label="Excluir relatório"
                  className="text-muted-foreground transition-colors hover:text-red-500"
                  onClick={() => {
                    excluir.mutate(r.id, {
                      onSuccess: () => {
                        if (abertoId === r.id) setAbertoId(null);
                        toast.success("Relatório excluído");
                      },
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Viewer — iframe sandbox COM scripts e SEM same-origin */}
      {aberto?.html && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{aberto.title}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => abrirNovaAba(aberto.html)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Nova aba
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => baixar(aberto.html, aberto.title)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Baixar
              </Button>
            </div>
          </div>
          <iframe
            title={aberto.title}
            srcDoc={aberto.html}
            sandbox="allow-scripts"
            className="h-[75vh] w-full rounded-xl border border-border/60 bg-white"
          />
        </div>
      )}
    </div>
  );
}
