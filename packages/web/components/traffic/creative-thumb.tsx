"use client";

/**
 * Miniatura do criativo, servida pelo nosso backend.
 *
 * A imagem vem da nossa base, não da Meta: as URLs que a Meta devolve são
 * assinadas e expiram, então uma tabela que aponta direto para elas funciona
 * hoje e quebra sozinha depois. Guardamos os bytes no sync, e aqui só
 * buscamos o que já é nosso — abrir a tabela não gera nenhuma chamada externa.
 *
 * O fetch é autenticado e vira data URL porque a rota exige o token no
 * cabeçalho, e o navegador não manda `Authorization` ao carregar `<img src>`.
 * O react-query guarda o resultado por ad, então rolar a tabela para cima e
 * para baixo não repete download nenhum.
 */

import { useState } from "react";
import { ExternalLink, ImageOff, Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiClient } from "@/lib/hooks/use-api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Resultado da busca da miniatura.
 *
 * `semRota` separa dois 404 que parecem iguais e não são: o do Fastify, quando
 * a ROTA não existe (backend numa versão anterior à do site), e o nosso, quando
 * o criativo simplesmente não tem imagem guardada. Sem essa distinção, uma API
 * desatualizada vira uma tabela inteira de ícones quebrados sem explicação — e
 * manda procurar defeito na Meta, que não tem nada a ver com isso.
 */
interface Miniatura {
  dataUrl: string | null;
  semRota: boolean;
}

export function useCreativeThumb(projectId: string, adId: string | null | undefined) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["creative-thumb", projectId, adId],
    queryFn: async (): Promise<Miniatura> => {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/api/traffic/analytics/${projectId}/creative-thumb/${adId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        // O 404 do Fastify traz `error: "Not Found"`; o nosso traz uma
        // mensagem em português dizendo o que faltou.
        const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
        return { dataUrl: null, semRota: res.status === 404 && corpo?.error === "Not Found" };
      }
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler a imagem"));
        reader.readAsDataURL(blob);
      });
      return { dataUrl, semRota: false };
    },
    enabled: Boolean(projectId && adId),
    // A miniatura de um anúncio não muda: uma vez carregada, vale a sessão toda.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}

/**
 * Onde assistir ao criativo.
 *
 * Vem da nossa rota, não do endpoint de vídeo da Meta: aquele responde
 * "Application does not have permission" nesta conta. A URL boa é a do media do
 * criativo, e o backend cuida de renová-la quando expira.
 *
 * Só busca quando a prévia abre — uma tabela de 40 linhas não pode resolver 40
 * vídeos só por estar na tela.
 */
function useCreativeVideo(projectId: string, adId: string | null | undefined, habilitado: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["creative-video", projectId, adId],
    queryFn: () =>
      apiClient<{ sourceUrl: string; origem: "cache" | "meta"; permalinkUrl: string | null }>(
        `/api/traffic/analytics/${projectId}/creative-video/${adId}`,
      ),
    enabled: habilitado && Boolean(projectId && adId),
    // A URL é assinada e expira; meia hora é bem menos que a validade dela.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

interface Props {
  projectId: string;
  adId: string | null | undefined;
  /** Nome do criativo — vira título ao abrir em tamanho maior. */
  nome?: string;
  /**
   * Id do vídeo na Meta, quando o criativo é vídeo. Com ele, abrir a prévia
   * toca a peça em vez de mostrar um quadro parado — que é como o criativo é
   * julgado nos outros funis.
   */
  videoId?: string | null;
  className?: string;
}

export function CreativeThumb({ projectId, adId, nome, videoId, className }: Props) {
  const { data, isLoading } = useCreativeThumb(projectId, adId);
  const [aberto, setAberto] = useState(false);
  const ehVideo = Boolean(videoId);
  const { data: video, isLoading: carregandoVideo, isError: videoFalhou } = useCreativeVideo(
    projectId,
    adId,
    aberto && ehVideo,
  );

  const caixa = `h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/40 ${className ?? ""}`;

  if (isLoading) return <div className={`${caixa} animate-pulse bg-muted`} />;
  if (!data?.dataUrl) {
    return (
      <div
        className={`${caixa} flex items-center justify-center bg-muted/30`}
        title={
          data?.semRota
            ? "O servidor da API ainda não tem esta funcionalidade — o deploy do backend está atrás do site. Refaça o deploy da API."
            : "Sem miniatura guardada para este criativo — ela é baixada no próximo sync com a Meta."
        }
      >
        <ImageOff className={`h-3.5 w-3.5 ${data?.semRota ? "text-amber-500/70" : "text-muted-foreground/50"}`} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`${caixa} group relative transition-opacity hover:opacity-80`}
        title={ehVideo ? "Assistir ao criativo" : "Ver maior"}
      >
        {/* <img> cru: a origem é uma data URL, que o otimizador do Next não processa. */}
        <img src={data.dataUrl} alt={nome ?? "Criativo"} className="h-full w-full object-cover" />
        {ehVideo && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </span>
        )}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{nome ?? "Criativo"}</DialogTitle>
          </DialogHeader>
          {/* Cascata igual à da galeria de criativos: arquivo direto quando a
              Meta entrega, embed quando não, e link como último recurso. A
              miniatura guardada vira o poster — não expira como a da Meta. */}
          {ehVideo && video?.sourceUrl ? (
            <video
              key={video.sourceUrl}
              src={video.sourceUrl}
              controls
              autoPlay
              poster={data.dataUrl}
              className="max-h-[70vh] w-full rounded-md bg-black object-contain"
            />
          ) : ehVideo && carregandoVideo ? (
            // A miniatura fica na tela enquanto o vídeo resolve: trocar por um
            // retângulo cinza faria parecer que algo quebrou.
            <div className="relative">
              <img src={data.dataUrl} alt={nome ?? "Criativo"} className="max-h-[70vh] w-full rounded-md object-contain opacity-60" />
              <span className="absolute inset-0 flex items-center justify-center text-xs text-white drop-shadow">
                Carregando o vídeo…
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <img src={data.dataUrl} alt={nome ?? "Criativo"} className="max-h-[70vh] w-full rounded-md object-contain" />
              {ehVideo && (
                <p className="text-[11px] text-muted-foreground">
                  {video?.permalinkUrl ? (
                    <a href={video.permalinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                      <ExternalLink className="h-3 w-3" /> Abrir o anúncio na Meta
                    </a>
                  ) : videoFalhou ? (
                    "Não consegui carregar o vídeo deste criativo."
                  ) : null}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
