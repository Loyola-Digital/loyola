"use client";

/**
 * "Insights do período" — o bloco de IA no fim do dashboard (itens 3 e 13).
 *
 * ## Gerar é um clique, não um efeito
 *
 * Cada análise é uma chamada ao modelo e leva perto de um minuto. Abrir a tela
 * mostra a última guardada para o período; gerar é decisão de quem está
 * olhando. Fica guardada uma semana e vale para todo mundo do time.
 */

import { ExternalLink, Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dica } from "@/components/instagram/dica";
import {
  useAnaliseComIa,
  useGerarAnaliseComIa,
  type AnaliseComIa,
  type DestaqueDaIa,
  type InstagramMedia,
} from "@/lib/hooks/use-instagram";
import { NOME_DO_FORMATO, type Formato } from "@/lib/utils/instagram-posts";

function Destaque({
  d,
  resultado,
  midia,
  tom,
}: {
  d: DestaqueDaIa;
  resultado: AnaliseComIa;
  midia: Map<string, InstagramMedia>;
  tom: "bom" | "ruim";
}) {
  const post = resultado.posts.find((p) => p.id === d.post_id);
  const m = midia.get(d.post_id);
  const thumb = m?.thumbnail_url ?? m?.media_url;
  const permalink = post?.permalink ?? m?.permalink;
  return (
    <li className="flex gap-3 rounded-md border border-border/50 p-3">
      {thumb ? (
        <img src={thumb} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-medium">{post?.titulo ?? "Post"}</p>
          {permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Abrir no Instagram"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {post && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {NOME_DO_FORMATO[post.formato as Formato] ?? post.formato}
          </p>
        )}
        <p className="text-[12px] leading-snug text-muted-foreground">{d.por_que}</p>
        <div className="flex flex-wrap gap-1">
          {d.fatores.map((f) => (
            <span
              key={f}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                tom === "bom" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

export function AnaliseComIaDoPeriodo({
  accountId,
  since,
  until,
  media,
}: {
  accountId: string | null;
  since: number;
  until: number;
  media?: InstagramMedia[];
}) {
  const { data, isLoading } = useAnaliseComIa(accountId, since, until);
  const gerar = useGerarAnaliseComIa(accountId, since, until);
  const resultado = data?.resultado ?? null;
  const midia = new Map((media ?? []).map((m) => [m.id, m]));

  function rodar() {
    gerar.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "A análise com IA falhou."),
    });
  }

  if (!accountId) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <CardTitle className="text-base">Insights do período</CardTitle>
          <Dica>
            {`A IA cruza os números do período e entrega as conclusões que importam, explica por que os melhores e os piores posts tiveram aquele resultado e aponta padrões.

O que ela recebe: as métricas do perfil e de cada post (views, alcance, compartilhamentos, salvamentos, seguidores, engajamento, gancho de 3s, tempo médio), a variação sobre o período anterior, a média por formato e a legenda de cada post. Os números são calculados pelo sistema; a IA só interpreta.

O que ela não vê: o vídeo e a imagem. "Gancho" para ela é a primeira frase da legenda somada à retenção dos 3 primeiros segundos.

A análise fica guardada por uma semana para o período e vale para todo o time. "Refazer" gera outra.`}
          </Dica>
        </div>
        {resultado && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={gerar.isPending} onClick={rodar}>
            <RefreshCw className={`h-3.5 w-3.5 ${gerar.isPending ? "animate-spin" : ""}`} />
            Refazer
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : gerar.isPending ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando os posts do período — costuma levar perto de um minuto.
          </p>
        ) : !resultado ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="max-w-xl text-[13px] text-muted-foreground">
              Gere uma leitura do período: 3 a 5 conclusões que cruzam os dados, por que os melhores e
              os piores posts foram assim e os padrões de tema, gancho e formato.
            </p>
            <Button size="sm" className="gap-1.5" onClick={rodar}>
              <Sparkles className="h-3.5 w-3.5" />
              Gerar análise com IA
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <ul className="space-y-3">
              {resultado.analise.insights.map((i) => (
                <li key={i.titulo} className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="text-[13px] font-medium leading-snug">{i.titulo}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{i.explicacao}</p>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 lg:grid-cols-2">
              {resultado.analise.melhores.length > 0 && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Por que foram bem
                  </h4>
                  <ul className="space-y-2">
                    {resultado.analise.melhores.map((d) => (
                      <Destaque key={d.post_id} d={d} resultado={resultado} midia={midia} tom="bom" />
                    ))}
                  </ul>
                </div>
              )}
              {resultado.analise.piores.length > 0 && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-500">
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Por que foram mal
                  </h4>
                  <ul className="space-y-2">
                    {resultado.analise.piores.map((d) => (
                      <Destaque key={d.post_id} d={d} resultado={resultado} midia={midia} tom="ruim" />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {resultado.analise.padroes.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Padrões identificados
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-[13px]">
                  {resultado.analise.padroes.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Gerado em {new Date(resultado.geradoEm).toLocaleString("pt-BR")} · a IA lê legendas e
              métricas, não assiste os vídeos
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
