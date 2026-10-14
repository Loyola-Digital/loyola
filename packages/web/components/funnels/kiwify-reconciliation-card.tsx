"use client";

/**
 * O aviso de divergência entre a planilha e a Kiwify.
 *
 * Mora ao lado do total de vendas porque é ali que a dúvida aparece: o número
 * da tela vem da planilha, e a planilha depende de webhooks que às vezes se
 * perdem. Não corrige nada — diz se bate e, quando não bate, QUAIS vendas estão
 * de cada lado. É a diferença entre discutir um total e achar a causa.
 *
 * Só aparece quando a etapa foi configurada: a maioria não usa Kiwify, e um
 * card pedindo configuração em toda etapa vira ruído.
 */

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FonteDeVendasForm } from "@/components/funnels/fonte-de-vendas-da-etapa";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useKiwifyReconciliation,
  useKiwifyStageConfig,
  type KiwifyStageConfig,
} from "@/lib/hooks/use-kiwify-reconciliation";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string | null) => (v ? v.split("-").reverse().join("/") : "—");

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

export function KiwifyReconciliationCard({ projectId, funnelId, stageId }: Props) {
  const cfg = useKiwifyStageConfig(projectId, funnelId, stageId);
  const [configOpen, setConfigOpen] = useState(false);
  const conferencia = useKiwifyReconciliation(projectId, funnelId, stageId, Boolean(cfg.data?.config));

  // Backend numa versão anterior à do site: a rota não existe e o Fastify
  // responde 404 "Not Found". Sem este aviso o card apenas SOME, e quem
  // procurou a configuração conclui que ela não foi feita.
  const rotaInexistente =
    cfg.isError && (cfg.error as { status?: number } | null)?.status === 404;
  if (rotaInexistente) {
    return (
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          A conferência com a Kiwify ainda não existe no servidor — o deploy do backend está atrás do
          site. Refaça o deploy da API para configurar.
        </p>
      </section>
    );
  }

  // Sem Kiwify no projeto não há o que oferecer — e a etapa nem sabe disso.
  if (cfg.isLoading || !cfg.data?.conectado) return null;

  const configurado = Boolean(cfg.data.config);
  const r = conferencia.data;
  const diverge = r?.configurado && !r.bate;

  return (
    <>
      <section
        className={`rounded-xl border p-3 ${
          !configurado
            ? "border-border/40 bg-card/60"
            : diverge
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {!configurado ? (
              <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : diverge ? (
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="text-sm font-medium">Conferência com a Kiwify</span>
            {conferencia.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1">
            {configurado && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => conferencia.refetch()}>
                <RefreshCw className="h-3 w-3" /> Conferir de novo
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setConfigOpen(true)}>
              <Settings2 className="h-3 w-3" /> {configurado ? "Ajustar" : "Configurar"}
            </Button>
          </div>
        </div>

        {!configurado ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Escolha os produtos e a data de início para conferir se as vendas da planilha batem com as da Kiwify.
          </p>
        ) : conferencia.isLoading ? (
          <Skeleton className="mt-2 h-12" />
        ) : conferencia.isError ? (
          <p className="mt-1.5 text-[11px] text-red-500">
            {conferencia.error instanceof Error ? conferencia.error.message : "Não consegui comparar agora."}
          </p>
        ) : r?.configurado ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              <span>
                Planilha: <strong className="tabular-nums">{r.totalPlanilha}</strong>
              </span>
              <span>
                Kiwify: <strong className="tabular-nums">{r.totalKiwify}</strong>
              </span>
              <span className={diverge ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
                {r.bate
                  ? "os números batem"
                  : `${r.soNaKiwifyTotal} só na Kiwify · ${r.soNaPlanilhaTotal} só na planilha`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {dataBr(r.periodo.de)} → {dataBr(r.periodo.ate)}
              </span>
            </div>

            {/* Ingressos ≠ vendas: a Kiwify manda UMA venda quando a pessoa
                leva três ingressos, e contar linhas subestima o público. */}
            {r.ingressosKiwify != null && (
              <div className="rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5 text-xs">
                <span>
                  <strong className="tabular-nums">{r.ingressosKiwify}</strong> ingressos
                  {r.fonteDosIngressos === "lotes" ? (
                    // Os lotes contam desde a abertura das vendas; o total de
                    // vendas acima respeita o período. Escrever "X ingressos em
                    // Y vendas" juntaria dois recortes diferentes num número só.
                    <span className="text-muted-foreground"> no evento todo</span>
                  ) : (
                    <>
                      {" "}em <strong className="tabular-nums">{r.totalKiwify}</strong> vendas
                    </>
                  )}
                </span>
                {r.fonteDosIngressos === "lotes" ? (
                  <span className="ml-2 text-muted-foreground">
                    — contagem oficial dos lotes, sem filtro de período.
                  </span>
                ) : r.comprasMultiplas.length > 0 ? (
                  <span className="ml-2 text-muted-foreground">
                    — {r.comprasMultiplas.length} compra(s) com mais de um ingresso:{" "}
                    {r.comprasMultiplas
                      .slice(0, 3)
                      .map((c) => `${c.nome ?? c.email ?? "?"} (${c.ingressos})`)
                      .join(", ")}
                    {r.comprasMultiplas.length > 3 ? "…" : ""}
                  </span>
                ) : (
                  <span className="ml-2 text-muted-foreground">— nenhuma compra múltipla no período.</span>
                )}
              </div>
            )}

            {/* Lotes: é aqui que os preços diferentes deixam de ser mistério —
                797, 997 e 1097 não são desconto, são lotes distintos, cada um
                com estoque próprio. */}
            {r.ingressosPorLote.length > 0 && (
              <div className="space-y-0.5 rounded-md border border-border/40 bg-background/60 p-2 text-[11px]">
                <p className="font-medium">Lotes do evento</p>
                {r.ingressosPorLote.map((l, i) => (
                  <div key={`${l.lote}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate" title={`${l.produto} · ${l.lote}`}>
                      {l.lote} <span className="text-muted-foreground">· {brl(l.preco)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {l.emitidos} emitido(s) · restam {l.disponiveis}/{l.total}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {r.planilhaSemChave > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {r.planilhaSemChave} linha(s) da planilha sem id e sem e-mail — não dá para conferir essas.
              </p>
            )}

            {diverge && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver as vendas que não casaram
                </summary>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <ListaDeVendas
                    titulo={`Só na Kiwify (${r.soNaKiwifyTotal})`}
                    dica="A venda existe na Kiwify e não chegou na planilha — webhook perdido."
                    vendas={r.soNaKiwify}
                  />
                  <ListaDeVendas
                    titulo={`Só na planilha (${r.soNaPlanilhaTotal})`}
                    dica="Linha na planilha sem venda correspondente — duplicata, produto fora do recorte ou lançamento à mão."
                    vendas={r.soNaPlanilha}
                  />
                </div>
                {r.amostraLimitada && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Mostrando as 50 primeiras de cada lado; os totais acima são completos.
                  </p>
                )}
                {r.produtosNaPlanilha.length > 0 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Produtos na planilha: {r.produtosNaPlanilha.map((p) => `${p.nome} (${p.vendas})`).join(" · ")}.
                    Se algum deles não está entre os selecionados, a divergência é de recorte, não de venda perdida.
                  </p>
                )}
              </details>
            )}
          </div>
        ) : null}
      </section>

      <ConfigDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        open={configOpen}
        onOpenChange={setConfigOpen}
        atual={cfg.data.config}
      />
    </>
  );
}

function ListaDeVendas({
  titulo,
  dica,
  vendas,
}: {
  titulo: string;
  dica: string;
  vendas: Array<{ email: string | null; data: string | null; valor: number; produto: string | null }>;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/60 p-2">
      <p className="font-medium">{titulo}</p>
      <p className="mb-1.5 text-[10px] text-muted-foreground">{dica}</p>
      {vendas.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Nenhuma.</p>
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {vendas.map((v, i) => (
            <div key={`${v.email}-${i}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={`${v.email ?? "sem e-mail"} · ${v.produto ?? ""}`}>
                {dataBr(v.data)} {v.email ?? "(sem e-mail)"}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{brl(v.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * O mesmo formulário da aba Planilhas, num diálogo — quem está olhando a
 * divergência ajusta o recorte sem sair do dashboard. O form vive em
 * `fonte-de-vendas-da-etapa.tsx` para as duas telas não divergirem.
 */
function ConfigDialog({
  projectId,
  funnelId,
  stageId,
  open,
  onOpenChange,
  atual,
}: Props & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  atual: KiwifyStageConfig | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Vendas da Kiwify nesta etapa</DialogTitle>
          <DialogDescription className="text-xs">
            O mesmo que fica em <strong>Configurar etapa → Planilhas</strong>, no topo.
          </DialogDescription>
        </DialogHeader>
        {/* `key` pelo estado salvo: reabrir depois de salvar remonta o form com
            o que está no banco, em vez de manter o rascunho anterior. */}
        <FonteDeVendasForm
          key={atual?.updatedAt ?? "novo"}
          projectId={projectId}
          funnelId={funnelId}
          stageId={stageId}
          atual={atual}
          ativo={open}
          onSalvo={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
