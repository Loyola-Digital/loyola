"use client";

/**
 * Que chamada faz comentar?
 *
 * "Que formato funciona" e "Por tema" respondem como e sobre o quê publicar.
 * Faltava a parte mais barata de trocar: a frase que pede a ação. Na Fernanda,
 * de 29/10 a 11/11, "Comente GUIA" rendeu 24 e 38 comentários por mil
 * alcançados enquanto BLACK, MFB, INGLÊS, BILÍNGUE e GRUPO ficaram entre 0,8 e
 * 8 — trinta vezes de diferença numa linha de legenda.
 *
 * A chamada é lida por REGRA, não pela IA: "Comente GUIA" está escrito na
 * legenda com todas as letras. Por isso esta tabela nasce preenchida, sem
 * depender de ninguém clicar em nada.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dica } from "@/components/instagram/dica";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { agruparPorChamada, leituraDasChamadas } from "@/lib/utils/instagram-chamadas";
import { postsNoPeriodo } from "@/lib/utils/instagram-posts";

interface Props {
  data?: InstagramMedia[];
  isLoading: boolean;
  since?: number;
  until?: number;
}

const inteiro = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const umaCasa = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));

export function PorChamada({ data, isLoading, since, until }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const posts = since != null && until != null ? postsNoPeriodo(data ?? [], since, until) : (data ?? []);
  const linhas = agruparPorChamada(posts);
  const leitura = leituraDasChamadas(linhas);

  if (linhas.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Que chamada faz comentar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum post no período.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Que chamada faz comentar</CardTitle>
          <Dica>
            {`Os posts agrupados pelo que a legenda PEDE: "Comente GUIA", "Link na bio", ou nada.

Lido por regra, direto da legenda — a palavra tem de estar em caixa alta, que é como ela aparece. Nada aqui é sugestão de IA, então não há o que revisar.

Comentários por mil alcançados, porque um post de 500 mil tem mais comentários que um de 10 mil sem a chamada ter funcionado melhor. Mediana e não média: um post viral puxaria a palavra inteira.

O agrupamento é pela PALAVRA e não por um tipo ("isca", "oferta"): foram as palavras que separaram os números, e juntá-las em tipos apagaria a diferença.`}
          </Dica>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A chamada é uma linha de legenda — a parte mais barata de trocar.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chamada</TableHead>
                <TableHead className="whitespace-nowrap">Posts</TableHead>
                <TableHead className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Comentários/mil
                    <Dica>
                      Comentários a cada mil alcançados, na mediana. É por aqui que a tabela ordena:
                      comentar é a ação que a chamada pede.
                    </Dica>
                  </span>
                </TableHead>
                <TableHead className="whitespace-nowrap">Mediana de alcance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.chamada}>
                  <TableCell className="max-w-[16rem]">
                    <span
                      className={`truncate ${l.tipo === "nenhuma" ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {l.chamada}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{l.posts}</TableCell>
                  <TableCell className="tabular-nums">{umaCasa(l.comentariosPorMil)}</TableCell>
                  <TableCell className="tabular-nums">{inteiro(l.alcance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {leitura && <p className="mt-3 text-xs text-muted-foreground">{leitura}</p>}
      </CardContent>
    </Card>
  );
}
