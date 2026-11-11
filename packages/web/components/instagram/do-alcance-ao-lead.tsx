"use client";

/**
 * O caminho de quem vê até quem vira lead, em etapas.
 *
 * Alcance, visitas ao perfil e cliques na bio são lidos como três números
 * soltos. Em fila, com a taxa entre eles, viram uma pergunta só: onde as
 * pessoas param? E a resposta muda o que fazer — alcance enorme com visita
 * minúscula é conteúdo que entretém e não convida; visita alta com clique
 * baixo é bio, não conteúdo.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dica } from "@/components/instagram/dica";
import type { InsightEntry } from "@/lib/hooks/use-instagram";
import { alcanceDoPeriodo, cliquesNaBio, somaDaMetrica } from "@/lib/utils/instagram-posts";
import { funilDoPeriodo, larguraLog } from "@/lib/utils/instagram-funil";

interface Props {
  insights?: InsightEntry[];
  isLoading: boolean;
}

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");

export function DoAlcanceAoLead({ insights, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const alcance = alcanceDoPeriodo(insights);
  if (alcance <= 0) return null;

  const etapas = funilDoPeriodo({
    alcance,
    visitasAoPerfil: somaDaMetrica(insights, "profile_views"),
    cliquesNaBio: cliquesNaBio(
      somaDaMetrica(insights, "website_clicks"),
      somaDaMetrica(insights, "profile_links_taps"),
    ).valor,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Do alcance ao lead</CardTitle>
          <Dica>
            {`Quantas pessoas chegaram a cada etapa, e quanto passou da etapa anterior.

As barras usam escala logarítmica: em escala linear a primeira etapa ocuparia tudo e as outras virariam fios. Comparar as larguras entre si não é comparar proporção — o número ao lado é que vale.`}
          </Dica>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {etapas.map((e) => (
          <div key={e.nome} className="grid gap-1 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{e.nome}</p>
              <p className="text-[11px] text-muted-foreground">{e.explicacao}</p>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                {e.faltaLigar ? (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    Falta ligar
                  </span>
                ) : (
                  <>
                    <b className="tabular-nums">{nf(e.valor ?? 0)}</b>
                    {e.taxa != null && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {umaCasa(e.taxa)}% de quem chegou na etapa acima
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="mt-1 h-3 rounded-full bg-muted">
                {!e.faltaLigar && (
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(larguraLog(e.valor ?? 0, etapas[0].valor ?? 1) * 100).toFixed(1)}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
