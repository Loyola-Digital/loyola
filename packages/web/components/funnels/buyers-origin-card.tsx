"use client";

/**
 * De onde veio quem comprou.
 *
 * Cruza o e-mail do comprador com a pesquisa de aplicação (e planilhas de lead),
 * que é onde moram as UTMs de ORIGEM. A UTM da planilha de venda diz o último
 * clique antes do checkout — outra pergunta, outra resposta.
 *
 * Ranking é uma série só (compradores), então uma cor só: colorir cada barra de
 * um jeito sugeriria categorias com significado próprio, que não é o caso.
 */

import { useState } from "react";
import { Users, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuyersOrigin } from "@/lib/hooks/use-sales-journey";

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function Ranking({ itens, total }: { itens: { nome: string; compradores: number }[]; total: number }) {
  if (itens.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Nada para mostrar.</p>;
  }
  const maior = Math.max(...itens.map((i) => i.compradores), 1);
  return (
    <div className="space-y-1.5">
      {itens.map((i) => {
        const share = total > 0 ? (i.compradores / total) * 100 : 0;
        return (
          <div key={i.nome} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">{i.nome}</span>
              {/* Separador explícito: "3" e "15%" lado a lado eram lidos como
                  "315%" ao copiar o texto do card. */}
              <span className="shrink-0 tabular-nums">
                <strong className="text-foreground">{nf(i.compradores)}</strong>
                <span className="text-[10px] text-muted-foreground"> · {share.toFixed(0)}%</span>
              </span>
            </div>
            {/* Barra proporcional ao MAIOR item, não ao total: com uma cauda
                longa de origens pequenas, escalar pelo total achataria tudo. */}
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${(i.compradores / maior) * 100}%`, background: "var(--viz-series-1)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BuyersOriginCard({
  projectId, funnelId, stageId,
}: { projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading } = useBuyersOrigin(projectId, funnelId, stageId);
  const [aba, setAba] = useState<"fonte" | "campanha">("fonte");

  if (isLoading) return <Skeleton className="h-[280px] rounded-xl" />;
  if (!data) return null;

  if (data.semDados) {
    return (
      <div className="spy-viz rounded-xl border border-dashed border-border/40 bg-card p-6 text-center">
        <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Origem dos compradores</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Nenhuma venda do produto principal ainda. Assim que houver, cruzamos o e-mail de quem
          comprou com a pesquisa de aplicação pra mostrar de onde o lead veio.
        </p>
      </div>
    );
  }

  const taxa = data.totalCompradores > 0 ? (data.casados / data.totalCompradores) * 100 : 0;
  const itens = aba === "fonte" ? data.porFonte : data.porCampanha;

  return (
    <div className="spy-viz rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Origem dos compradores</h3>
          <p className="text-[11px] text-muted-foreground">
            E-mail de quem comprou, cruzado com a pesquisa de aplicação
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border/50 p-0.5 text-xs">
          {([
            ["fonte", "Por fonte"],
            ["campanha", "Por campanha"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={`rounded px-2.5 py-1 transition-colors ${
                aba === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Compradores
          </p>
          <p className="text-2xl font-semibold leading-none">{nf(data.totalCompradores)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Com origem
          </p>
          <p className="text-2xl font-semibold leading-none">{nf(data.casados)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{taxa.toFixed(0)}% dos compradores</p>
        </div>
      </div>

      {data.semOrigem > 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {data.semOrigem} comprador{data.semOrigem !== 1 ? "es" : ""} não apareceu em nenhuma
          pesquisa ou planilha de lead. Costuma ser quem comprou sem passar pela aplicação, ou usou
          um e-mail diferente no checkout.
        </p>
      )}

      <Ranking itens={itens} total={data.casados} />

      {/* Toda planilha conectada no funil entra aqui automaticamente (menos as
          de venda). Mostrar quantos cada uma casou é o que denuncia a fonte que
          entrou mas não contribui — coluna de e-mail não mapeada, aba errada. */}
      {data.fontes.length > 0 && (
        <div className="mt-3 border-t border-border/30 pt-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Planilhas cruzadas ({data.fontes.length}) — automático
          </p>
          <ul className="space-y-0.5">
            {data.fontes.map((f) => (
              <li key={f.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="truncate text-muted-foreground">{f.label}</span>
                <span
                  className={`shrink-0 tabular-nums ${
                    f.compradores === 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
                  }`}
                >
                  {f.compradores === 0 ? "nenhum" : `${nf(f.compradores)} comprador${f.compradores !== 1 ? "es" : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
