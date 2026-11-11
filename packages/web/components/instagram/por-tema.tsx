"use client";

/**
 * Que assunto rende?
 *
 * Formato responde "como publicar", tema responde "sobre o quê" — e era a
 * pergunta sem resposta na tela. As etiquetas saem da legenda: a IA sugere em
 * lote e o social media revisa na tabela de posts, porque tema é julgamento
 * editorial e um tema errado silencioso envenena a conclusão.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dica } from "@/components/instagram/dica";
import { useSugerirTemas, type InstagramMedia } from "@/lib/hooks/use-instagram";
import { agruparPorTema, leituraDosTemas } from "@/lib/utils/instagram-temas";
import { postsNoPeriodo } from "@/lib/utils/instagram-posts";

interface Props {
  data?: InstagramMedia[];
  isLoading: boolean;
  since?: number;
  until?: number;
  accountId: string | null;
}

const inteiro = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const umaCasa = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));

export function PorTema({ data, isLoading, since, until, accountId }: Props) {
  const sugerir = useSugerirTemas(accountId);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const posts = since != null && until != null ? postsNoPeriodo(data ?? [], since, until) : (data ?? []);
  const linhas = agruparPorTema(posts);
  const semTema = posts.filter((p) => !p.tema?.trim()).length;
  const leitura = leituraDosTemas(linhas);

  const botao = accountId && (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={sugerir.isPending}
      onClick={() =>
        sugerir.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(
              r.sugeridos > 0
                ? `${r.sugeridos} post(s) etiquetado(s) — revise na tabela de posts`
                : (r.mensagem ?? "Nada para etiquetar"),
            ),
          onError: (e) => toast.error(e instanceof Error ? e.message : "A sugestão falhou"),
        })
      }
      title="A IA lê a legenda dos posts sem tema e sugere uma etiqueta para cada um"
    >
      <Sparkles className={`h-3.5 w-3.5 ${sugerir.isPending ? "animate-pulse" : ""}`} />
      {sugerir.isPending ? "Lendo as legendas…" : "Sugerir temas"}
    </Button>
  );

  if (linhas.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por tema do conteúdo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Nenhum post tem tema ainda. A IA lê a legenda e sugere uma etiqueta para cada um; depois é
            só corrigir o que estiver errado na coluna <b>Tema</b> da tabela de posts.
          </p>
          {botao}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Por tema do conteúdo</CardTitle>
            <Dica>
              {`Os posts agrupados pelo assunto de que tratam.

Mediana, não média: um post viral puxaria a média do tema inteiro e faria parecer que o assunto rende quando o que rendeu foi um post.

A etiqueta é sugerida pela IA a partir da legenda e revisada na coluna Tema da tabela de posts.`}
            </Dica>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {semTema > 0
              ? `${semTema} post(s) do período ainda sem tema — eles ficam de fora desta tabela.`
              : "Todos os posts do período estão etiquetados."}
          </p>
        </div>
        {botao}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tema</TableHead>
                <TableHead className="whitespace-nowrap">Posts</TableHead>
                <TableHead className="whitespace-nowrap">Mediana de alcance</TableHead>
                <TableHead className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Interesse/mil
                    <Dica>
                      Compartilhamentos + salvamentos a cada mil alcançados. É por aqui que a tabela
                      ordena: a pergunta é que assunto se espalha, não sobre o que se publica mais.
                    </Dica>
                  </span>
                </TableHead>
                <TableHead className="whitespace-nowrap">Mediana de engajamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.tema}>
                  <TableCell className="max-w-[16rem]">
                    <span className="truncate font-medium">{l.tema}</span>
                    {l.sugeridos > 0 && (
                      <span
                        className="ml-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                        title={`${l.sugeridos} post(s) com a etiqueta sugerida pela IA, ainda sem revisão`}
                      >
                        {l.sugeridos} a revisar
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{l.posts}</TableCell>
                  <TableCell className="tabular-nums">{inteiro(l.alcance)}</TableCell>
                  <TableCell className="tabular-nums">{umaCasa(l.interesse)}</TableCell>
                  <TableCell className="tabular-nums">
                    {l.engajamento == null ? "—" : `${umaCasa(l.engajamento)}%`}
                  </TableCell>
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
