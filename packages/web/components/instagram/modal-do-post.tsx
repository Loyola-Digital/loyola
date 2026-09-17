"use client";

/**
 * O post por dentro: números, comparação com a média do perfil e a leitura da
 * IA sobre por que ele foi bem ou mal.
 *
 * ## Por que a análise é um clique, e fica guardada
 *
 * Cada leitura custa uma chamada ao modelo. O post não muda depois de
 * publicado, então a análise é gravada na linha dele no banco: abrir de novo
 * mostra a mesma, de graça. "Refazer" existe para quando o post ainda está
 * sendo entregue e os números mudaram.
 */

import { ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Dica } from "@/components/instagram/dica";
import {
  useAnaliseDoPost,
  useGerarAnaliseDoPost,
  type InstagramMedia,
} from "@/lib/hooks/use-instagram";
import {
  METRICAS_DO_POST,
  NOME_DO_FORMATO,
  formatoDoPost,
  vsMedia,
  type ChaveDaMetrica,
} from "@/lib/utils/instagram-posts";

const CORES_DO_VEREDITO = {
  bom: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  mediano: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  ruim: "bg-red-500/10 text-red-500 border-red-500/30",
} as const;

export function ModalDoPost({
  post,
  accountId,
  medias,
  aberto,
  onOpenChange,
}: {
  post: InstagramMedia | null;
  accountId: string | null;
  /** Média do perfil no período — a régua de cada número. */
  medias: Record<ChaveDaMetrica, number | null>;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useAnaliseDoPost(aberto ? accountId : null, post?.id ?? null);
  const gerar = useGerarAnaliseDoPost(accountId, post?.id ?? null);
  const analise = data?.analise ?? null;

  if (!post) return null;
  const thumb = post.thumbnail_url ?? post.media_url;
  const formato = formatoDoPost(post);

  function rodar() {
    gerar.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "A análise falhou."),
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {NOME_DO_FORMATO[formato]} de{" "}
            {new Date(post.timestamp).toLocaleDateString("pt-BR")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-3">
          {thumb ? (
            <img src={thumb} alt="" className="h-24 w-24 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-24 w-24 shrink-0 rounded bg-muted" />
          )}
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-4 text-[13px] leading-snug">{post.caption ?? "Sem legenda"}</p>
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir no Instagram
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {METRICAS_DO_POST.map((m) => {
            const v = m.valor(post);
            const d = vsMedia(v, medias[m.chave], m.taxa);
            const texto =
              v == null
                ? "—"
                : m.segundos
                  ? `${v.toFixed(1).replace(".", ",")}s`
                  : m.taxa
                    ? `${v.toFixed(2).replace(".", ",")}%`
                    : Math.round(v).toLocaleString("pt-BR");
            return (
              <div key={m.chave} className="rounded-md border border-border/40 bg-card/40 p-2">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.rotulo}
                  <Dica>{m.dica}</Dica>
                </div>
                <div className="text-sm font-semibold tabular-nums">{texto}</div>
                {d != null && (
                  <div
                    className={`text-[10px] tabular-nums ${
                      d > 0 ? "text-emerald-600" : d < 0 ? "text-red-500" : "text-muted-foreground"
                    }`}
                  >
                    {d > 0 ? "+" : "−"}
                    {m.taxa
                      ? `${Math.abs(d).toFixed(1).replace(".", ",")} pp`
                      : `${Math.round(Math.abs(d))}%`}{" "}
                    vs média
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 rounded-md border border-border/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h4 className="text-[13px] font-semibold">Análise com IA</h4>
              <Dica>
                {`A IA recebe os números deste post, a média do perfil e a média do mesmo formato — tudo calculado pelo sistema — e explica o resultado.

Ela lê a legenda e as métricas; NÃO assiste o vídeo. "Gancho" para ela é a primeira frase da legenda somada à retenção dos 3 primeiros segundos que a Meta mede.

Bom, mediano ou ruim é comparado com o próprio perfil, não com o mercado.

A análise fica guardada no banco: abrir de novo não custa nada. "Refazer" gera outra, útil quando o post ainda está sendo entregue.`}
              </Dica>
            </div>
            {analise && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" disabled={gerar.isPending} onClick={rodar}>
                <RefreshCw className={`h-3 w-3 ${gerar.isPending ? "animate-spin" : ""}`} />
                Refazer
              </Button>
            )}
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : gerar.isPending ? (
            <p className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lendo os números deste post…
            </p>
          ) : !analise ? (
            <div className="flex flex-col items-start gap-2 py-1">
              <p className="text-[12px] text-muted-foreground">
                Descubra por que este post foi bem ou mal, comparado com a média do perfil.
              </p>
              <Button size="sm" className="h-8 gap-1.5" onClick={rodar}>
                <Sparkles className="h-3.5 w-3.5" />
                Gerar análise de IA
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <span
                className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${CORES_DO_VEREDITO[analise.veredito]}`}
              >
                {analise.veredito}
              </span>
              <p className="text-[13px] leading-snug">{analise.por_que}</p>

              {analise.fatores.length > 0 && (
                <ul className="space-y-1">
                  {analise.fatores.map((f) => (
                    <li key={f.nome} className="text-[12px] leading-snug">
                      <span className="font-medium">{f.nome}:</span>{" "}
                      <span className="text-muted-foreground">{f.leitura}</span>
                    </li>
                  ))}
                </ul>
              )}

              {analise.recomendacoes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Para o próximo
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-[12px]">
                    {analise.recomendacoes.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data?.geradoEm && (
                <p className="text-[10px] text-muted-foreground">
                  Gerada em {new Date(data.geradoEm).toLocaleString("pt-BR")} · a IA lê legenda e
                  métricas, não assiste o vídeo
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
