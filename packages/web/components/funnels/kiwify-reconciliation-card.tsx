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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useDisableKiwifyStageConfig,
  useKiwifyProducts,
  useKiwifyReconciliation,
  useKiwifyStageConfig,
  useSaveKiwifyStageConfig,
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
                  <strong className="tabular-nums">{r.ingressosKiwify}</strong> ingressos em{" "}
                  <strong className="tabular-nums">{r.totalKiwify}</strong> vendas
                </span>
                {r.comprasMultiplas.length > 0 ? (
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
  atual: { productIds: string[]; startDate: string; ticketPrice?: number | null } | null;
}) {
  const produtos = useKiwifyProducts(projectId, open);
  const salvar = useSaveKiwifyStageConfig(projectId, funnelId, stageId);
  const desligar = useDisableKiwifyStageConfig(projectId, funnelId, stageId);
  const [selecionados, setSelecionados] = useState<string[]>(atual?.productIds ?? []);
  const [data, setData] = useState(atual?.startDate ?? "");
  const [precoIngresso, setPrecoIngresso] = useState(atual?.ticketPrice != null ? String(atual.ticketPrice) : "");
  const [busca, setBusca] = useState("");

  const lista = (produtos.data?.products ?? []).filter((p) =>
    busca.trim() ? p.name.toLowerCase().includes(busca.trim().toLowerCase()) : true,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Conferência com a Kiwify</DialogTitle>
          <DialogDescription className="text-xs">
            Escolha os produtos desta etapa e a partir de quando contar. A conta da Kiwify tem todos os
            produtos do expert — selecionar o produto errado acusa divergência que não existe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kiwify-data" className="text-xs font-medium">Contar a partir de</Label>
            <Input id="kiwify-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kiwify-ingresso" className="text-xs font-medium">
              Preço de um ingresso <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="kiwify-ingresso"
              type="number"
              step="0.01"
              min="0"
              value={precoIngresso}
              onChange={(e) => setPrecoIngresso(e.target.value)}
              placeholder="ex.: 1097"
            />
            <p className="text-[11px] text-muted-foreground">
              A Kiwify manda <strong>uma venda só</strong> quando a pessoa compra vários ingressos.
              Com o preço unitário, dá para descobrir quantos foram — o valor da compra é múltiplo
              dele. Sem isso, cada venda conta como um ingresso.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Produtos {selecionados.length > 0 && <span className="text-muted-foreground">({selecionados.length} selecionado(s))</span>}
            </Label>
            <Input placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {produtos.isLoading ? (
              <Skeleton className="h-40" />
            ) : lista.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhum produto encontrado.</p>
            ) : (
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border/40 p-1">
                {lista.map((p) => {
                  const marcado = selecionados.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSelecionados((atuais) =>
                          marcado ? atuais.filter((x) => x !== p.id) : [...atuais, p.id],
                        )
                      }
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                        marcado ? "bg-primary/10 font-medium" : "hover:bg-muted"
                      }`}
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-sm border ${marcado ? "border-primary bg-primary" : "border-border"}`} />
                      <span className="truncate" title={p.name}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            {atual && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] text-muted-foreground hover:text-red-500"
                disabled={desligar.isPending}
                onClick={() =>
                  desligar.mutate(undefined, {
                    onSuccess: () => {
                      toast.success("Conferência desligada nesta etapa");
                      onOpenChange(false);
                    },
                  })
                }
              >
                Desligar conferência
              </Button>
            )}
            <Button
              size="sm"
              className="ml-auto gap-1.5"
              disabled={salvar.isPending || selecionados.length === 0 || !data}
              onClick={() =>
                salvar.mutate(
                  {
                    productIds: selecionados,
                    startDate: data,
                    // Campo vazio significa "não sei o preço", e é diferente de
                    // zero: manda `null` para cada venda voltar a contar 1.
                    ticketPrice: precoIngresso.trim() ? Number(precoIngresso) : null,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Conferência configurada");
                      onOpenChange(false);
                    },
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui salvar"),
                  },
                )
              }
            >
              {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
