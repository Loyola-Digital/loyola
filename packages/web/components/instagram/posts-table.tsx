"use client";

/**
 * Ranking dos posts do período.
 *
 * ## O que responde
 *
 * "Qual conteúdo venceu?" — e a resposta muda com o objetivo: o vencedor em
 * alcance raramente é o vencedor em salvamentos. Por isso toda coluna ordena.
 *
 * ## Contra a média do próprio perfil
 *
 * Abaixo de cada número vai quanto ele ficou acima ou abaixo da média dos
 * posts do período. Em perfil grande, "4.300 compartilhamentos" não diz se é
 * bom; "+72% acima da média" diz.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Link2, RefreshCw } from "lucide-react";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { format, parseISO } from "date-fns";
import { useOrganicPostLinks } from "@/lib/hooks/use-organic-posts";
import { LinkPostToStageModal } from "@/components/funnels/link-post-to-stage-modal";
import { Dica } from "@/components/instagram/dica";
import {
  METRICAS_DO_POST,
  NOME_DO_FORMATO,
  formatoDoPost,
  mediasDoPerfil,
  postsNoPeriodo,
  vsMedia,
  type ChaveDaMetrica,
  type MetricaDoPost,
} from "@/lib/utils/instagram-posts";

type Ordem = ChaveDaMetrica | "timestamp";

interface PostsTableProps {
  data?: InstagramMedia[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  projectId?: string;
  /** Período do seletor, em segundos. Sem ele, a tabela mostra tudo que veio. */
  since?: number;
  until?: number;
}

const COR_DO_FORMATO = {
  reels: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  carrossel: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  estatico: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
} as const;

function fmtValor(m: MetricaDoPost, v: number | null): string {
  if (v == null) return "—";
  if (m.segundos) return `${v.toFixed(1).replace(".", ",")}s`;
  if (m.taxa) return `${v.toFixed(2).replace(".", ",")}%`;
  return Math.round(v).toLocaleString("pt-BR");
}

/**
 * A comparação com a média, embaixo do número.
 *
 * Só ganha cor quando a diferença é grande (±30% ou ±1 pp): uma tabela com
 * nove colunas coloridas em toda linha vira ruído, e o que se procura é o
 * post que se destacou.
 */
function VsMedia({ m, valor, media }: { m: MetricaDoPost; valor: number | null; media: number | null }) {
  const d = vsMedia(valor, media, m.taxa);
  if (d == null) return null;
  const forte = m.taxa ? Math.abs(d) >= 1 : Math.abs(d) >= 30;
  const cor = !forte ? "text-muted-foreground/70" : d > 0 ? "text-emerald-600" : "text-red-500";
  const Icone = d > 0 ? ArrowUp : ArrowDown;
  const n = m.taxa ? `${Math.abs(d).toFixed(1).replace(".", ",")} pp` : `${Math.round(Math.abs(d))}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${cor}`}>
      {Math.round(d * 10) !== 0 && <Icone className="h-2.5 w-2.5" />}
      {n}
    </span>
  );
}

export function PostsTable({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  projectId,
  since,
  until,
}: PostsTableProps) {
  const [ordem, setOrdem] = useState<Ordem>("timestamp");
  const [crescente, setCrescente] = useState(false);
  const [linkModal, setLinkModal] = useState<{ mediaId: string; title: string } | null>(null);

  const { data: linksMap } = useOrganicPostLinks(projectId ?? null, "instagram");
  const linkedCountByMediaId = new Map<string, number>();
  for (const entry of linksMap ?? []) {
    linkedCountByMediaId.set(entry.externalId, entry.stageIds.length);
  }

  const posts = useMemo(
    () => (data && since != null && until != null ? postsNoPeriodo(data, since, until) : data ?? []),
    [data, since, until],
  );
  const medias = useMemo(() => mediasDoPerfil(posts), [posts]);

  function ordenarPor(chave: Ordem) {
    if (ordem === chave) setCrescente((v) => !v);
    else {
      setOrdem(chave);
      setCrescente(false);
    }
  }

  const ordenados = useMemo(() => {
    const valor = (p: InstagramMedia): number | null =>
      ordem === "timestamp"
        ? new Date(p.timestamp).getTime()
        : METRICAS_DO_POST.find((m) => m.chave === ordem)!.valor(p);
    return [...posts].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      // Sem o dado vai sempre para o fim, nos dois sentidos: um Reels sem
      // "seguidores" não é o pior post em seguidores, é um post sem o número.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return crescente ? va - vb : vb - va;
    });
  }, [posts, ordem, crescente]);

  const showLinkColumn = !!projectId;

  // Função e não componente: declarado aqui dentro, um componente remontaria
  // o cabeçalho a cada render.
  function cabecalho(chave: Ordem, rotulo: string, dica: string) {
    const ativa = ordem === chave;
    const Icone = !ativa ? ArrowUpDown : crescente ? ArrowUp : ArrowDown;
    return (
      <TableHead key={chave} className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`-ml-2 h-8 gap-1 px-2 ${ativa ? "text-foreground" : ""}`}
            onClick={() => ordenarPor(chave)}
          >
            {rotulo}
            <Icone className={`h-3 w-3 ${ativa ? "" : "opacity-40"}`} />
          </Button>
          <Dica>{dica}</Dica>
        </span>
      </TableHead>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Ranking de posts do período</CardTitle>
          <Dica>
            {`Todos os posts publicados no período escolhido, com as métricas de cada um.

Clique em qualquer coluna para ordenar: mais views, mais alcance, mais compartilhamentos, mais salvamentos, mais seguidores ou maior engajamento.

Embaixo de cada número: quanto o post ficou acima (↑) ou abaixo (↓) da média dos posts do período. Contagens em %, taxas em pontos percentuais (pp). Fica colorido só quando a diferença é grande (±30% ou ±1 pp).`}
          </Dica>
          {posts.length > 0 && (
            <span className="text-xs text-muted-foreground">({posts.length})</span>
          )}
        </div>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum post publicado no período
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Mídia</TableHead>
                  <TableHead>Legenda</TableHead>
                  <TableHead className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Formato
                      <Dica>
                        {`Reels = vídeo. Carrossel = várias fotos ou vídeos num post. Estático = uma foto só.`}
                      </Dica>
                    </span>
                  </TableHead>
                  {cabecalho("timestamp", "Data", "Data de publicação.")}
                  {METRICAS_DO_POST.map((m) => cabecalho(m.chave, m.rotulo, m.dica))}
                  {showLinkColumn && <TableHead className="w-24 text-right">Etapa</TableHead>}
                </TableRow>
                {/* A média que a comparação usa, à vista: sem ela o "+72%" não
                    tem contra o quê. */}
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={4} className="py-1.5 text-[11px] text-muted-foreground">
                    Média do perfil no período
                  </TableCell>
                  {METRICAS_DO_POST.map((m) => (
                    <TableCell key={m.chave} className="py-1.5 text-[11px] tabular-nums text-muted-foreground">
                      {fmtValor(m, medias[m.chave])}
                    </TableCell>
                  ))}
                  {showLinkColumn && <TableCell />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenados.map((post) => {
                  const thumb = post.thumbnail_url ?? post.media_url;
                  const linkedCount = linkedCountByMediaId.get(post.id) ?? 0;
                  const captionPreview = post.caption ?? "—";
                  const formato = formatoDoPost(post);
                  return (
                    <TableRow key={post.id}>
                      <TableCell>
                        {thumb ? (
                          <div className="relative h-10 w-10 overflow-hidden rounded">
                            <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-1">
                          <p className="truncate text-sm">{captionPreview}</p>
                          {post.permalink && (
                            <a
                              href={post.permalink}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Abrir no Instagram"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COR_DO_FORMATO[formato]}`}>
                          {NOME_DO_FORMATO[formato]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(post.timestamp), "dd/MM/yy")}
                      </TableCell>
                      {METRICAS_DO_POST.map((m) => {
                        const v = m.valor(post);
                        return (
                          <TableCell key={m.chave} className="whitespace-nowrap">
                            <div className="text-sm tabular-nums">{fmtValor(m, v)}</div>
                            <VsMedia m={m} valor={v} media={medias[m.chave]} />
                          </TableCell>
                        );
                      })}
                      {showLinkColumn && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() =>
                              setLinkModal({
                                mediaId: post.id,
                                title:
                                  captionPreview.length > 80
                                    ? `${captionPreview.slice(0, 77)}...`
                                    : captionPreview,
                              })
                            }
                            title="Vincular a uma etapa do funil"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {linkedCount > 0 && (
                              <span className="text-xs font-medium">{linkedCount}</span>
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {projectId && linkModal && (
        <LinkPostToStageModal
          projectId={projectId}
          source="instagram"
          externalId={linkModal.mediaId}
          postTitle={linkModal.title}
          open={!!linkModal}
          onOpenChange={(o) => { if (!o) setLinkModal(null); }}
        />
      )}
    </Card>
  );
}
