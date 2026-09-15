"use client";

/**
 * Reels × carrossel × estático — a média de cada formato no período.
 *
 * Responde "neste mês os carrosséis engajaram mais, mas os Reels alcançaram
 * mais". As frases no topo saem das mesmas linhas da tabela
 * (`conclusoesDosFormatos`), então nunca contradizem os números embaixo.
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dica } from "@/components/instagram/dica";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import {
  NOME_DO_FORMATO,
  conclusoesDosFormatos,
  performancePorFormato,
  postsNoPeriodo,
  type LinhaDoFormato,
} from "@/lib/utils/instagram-posts";

const int = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("pt-BR"));
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")}%`);
const um = (n: number | null) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

const COLUNAS: { rotulo: string; dica: string; valor: (l: LinhaDoFormato) => string }[] = [
  { rotulo: "Posts", dica: "Quantos posts desse formato saíram no período.", valor: (l) => int(l.posts) },
  { rotulo: "Views / post", dica: "Média de visualizações por post do formato.", valor: (l) => int(l.viewsMedia) },
  { rotulo: "Alcance / post", dica: "Média de contas únicas alcançadas por post do formato.", valor: (l) => int(l.alcanceMedio) },
  {
    rotulo: "Engajamento",
    dica: "Soma das interações (curtidas + comentários + salvamentos + compartilhamentos) dos posts do formato ÷ soma do alcance deles × 100.\n\nÉ a taxa do formato inteiro, não a média das taxas: assim um post pequeno com 30% não distorce o resultado.",
    valor: (l) => pct(l.engajamento),
  },
  { rotulo: "Compart. / post", dica: "Média de compartilhamentos por post do formato.", valor: (l) => int(l.compartMedio) },
  { rotulo: "Salvos / post", dica: "Média de salvamentos por post do formato.", valor: (l) => int(l.salvosMedio) },
  {
    rotulo: "Salvos / mil alcançados",
    dica: "Salvamentos a cada mil contas alcançadas. Compara formatos com alcances muito diferentes: um carrossel com menos alcance pode ser muito mais salvo proporcionalmente.",
    valor: (l) => um(l.salvosPorMil),
  },
  {
    rotulo: "Gancho 3s",
    dica: "Média da retenção nos 3 primeiros segundos (100 − taxa de pulo da Meta). Só Reels tem esse dado.",
    valor: (l) => pct(l.ganchoMedio),
  },
  {
    rotulo: "Seguidores",
    dica: "Soma dos seguidores gerados pelos posts do formato. A Meta só informa para foto e carrossel — em Reels aparece \"—\".",
    valor: (l) => int(l.seguidores),
  },
];

export function PerformancePorFormato({
  data,
  isLoading,
  since,
  until,
}: {
  data?: InstagramMedia[];
  isLoading: boolean;
  since: number;
  until: number;
}) {
  const linhas = useMemo(
    () => performancePorFormato(data ? postsNoPeriodo(data, since, until) : []),
    [data, since, until],
  );
  const frases = useMemo(() => conclusoesDosFormatos(linhas), [linhas]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Performance por formato</CardTitle>
          <Dica>
            {`Reels × carrossel × post estático, com a média de cada formato nos posts publicados no período.

As frases de destaque saem desta mesma tabela: comparam só quando há pelo menos dois formatos com o dado.`}
          </Dica>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum post publicado no período</p>
        ) : (
          <>
            {frases.length > 0 && (
              <ul className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-[13px]">
                {frases.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Formato
                    </th>
                    {COLUNAS.map((c) => (
                      <th
                        key={c.rotulo}
                        className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.rotulo}
                          <Dica>{c.dica}</Dica>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.formato} className="border-b border-border/40 last:border-b-0">
                      <td className="px-2 py-2 font-medium">{NOME_DO_FORMATO[l.formato]}</td>
                      {COLUNAS.map((c) => (
                        <td key={c.rotulo} className="px-2 py-2 text-right tabular-nums">
                          {c.valor(l)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
