"use client";

/**
 * As leituras do período que pedem decisão.
 *
 * Cada cartão nasce de um número que já está na tela, e existe porque o número
 * sozinho não diz o que fazer: "79% de saídas" é fato, "o conteúdo chega, o
 * aperto é segurar quem chega" é decisão.
 *
 * Nenhum cartão aparece sem o dado que o sustenta — e quando nada chama
 * atenção, a seção diz isso em vez de encher a tela de conselho genérico.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dica } from "@/components/instagram/dica";
import type { InsightEntry, InstagramMedia } from "@/lib/hooks/use-instagram";
import {
  alcanceDoPeriodo,
  alcancePorSeguidor,
  cliquesNaBio,
  interacoesDoPeriodo,
  seguidoresGanhosEPerdidos,
  somaDaMetrica,
} from "@/lib/utils/instagram-posts";
import { decisoesDoPeriodo, type Decisao } from "@/lib/utils/instagram-decisoes";

interface Props {
  insights?: InsightEntry[];
  previousInsights?: InsightEntry[];
  posts?: InstagramMedia[];
  isLoading: boolean;
}

const COR: Record<Decisao["nivel"], string> = {
  urgente: "border-l-red-500",
  atencao: "border-l-amber-500",
  bom: "border-l-emerald-500",
};

const SELO: Record<Decisao["nivel"], { texto: string; classe: string }> = {
  urgente: { texto: "Decidir agora", classe: "bg-red-500/10 text-red-600 dark:text-red-400" },
  atencao: { texto: "Olhar", classe: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  bom: { texto: "Boa notícia", classe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const engajamentoDe = (entries?: InsightEntry[]) => {
  const alcance = alcanceDoPeriodo(entries);
  return alcance > 0 ? (interacoesDoPeriodo(entries) / alcance) * 100 : null;
};

export function LeiturasQuePedemDecisao({ insights, previousInsights, posts, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  const temAnterior = !!previousInsights && previousInsights.length > 0;
  const follows = seguidoresGanhosEPerdidos(insights);

  const decisoes = decisoesDoPeriodo({
    alcance: alcanceDoPeriodo(insights),
    alcanceAnterior: temAnterior ? alcanceDoPeriodo(previousInsights) : null,
    entraram: follows?.gained ?? null,
    sairam: follows?.lost ?? null,
    visitasAoPerfil: somaDaMetrica(insights, "profile_views"),
    cliquesNaBio: cliquesNaBio(
      somaDaMetrica(insights, "website_clicks"),
      somaDaMetrica(insights, "profile_links_taps"),
    ).valor,
    engajamento: engajamentoDe(insights),
    engajamentoAnterior: temAnterior ? engajamentoDe(previousInsights) : null,
    posts: posts ?? [],
  });

  // `alcancePorSeguidor` entra só para o rodapé: quando o público novo é grande,
  // vale lembrar que o engajamento cai por isso.
  const naoSeguidores = alcancePorSeguidor(insights)?.pctNaoSeguidores ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Leituras que pedem decisão</CardTitle>
          <Dica>
            Cada cartão nasce de um número desta página, e vem com a ação junto. São regras sobre os
            próprios dados — não há IA aqui, para que o cartão nunca discorde do número que o gerou.
          </Dica>
        </div>
      </CardHeader>
      <CardContent>
        {decisoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada no período chama atenção a ponto de pedir decisão. É um bom sinal — e também pode
            ser falta de dado: sem tema etiquetado e sem Reels medidos, metade das leituras não tem
            como existir.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {decisoes.map((d) => (
              <article
                key={d.titulo}
                className={`rounded-xl border border-l-2 border-border/40 bg-card/60 p-3 ${COR[d.nivel]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold">{d.titulo}</h4>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SELO[d.nivel].classe}`}>
                    {SELO[d.nivel].texto}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.evidencia}</p>
                <p className="mt-2 text-sm">{d.acao}</p>
              </article>
            ))}
          </div>
        )}
        {naoSeguidores != null && naoSeguidores >= 70 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {naoSeguidores.toFixed(1).replace(".", ",")}% de quem viu ainda não seguia a conta — é
            público novo, e público novo reage menos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
