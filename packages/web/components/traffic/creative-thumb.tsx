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
import { ImageOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

interface Props {
  projectId: string;
  adId: string | null | undefined;
  /** Nome do criativo — vira título ao abrir em tamanho maior. */
  nome?: string;
  className?: string;
}

export function CreativeThumb({ projectId, adId, nome, className }: Props) {
  const { data, isLoading } = useCreativeThumb(projectId, adId);
  const [aberto, setAberto] = useState(false);

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
      <button type="button" onClick={() => setAberto(true)} className={`${caixa} transition-opacity hover:opacity-80`} title="Ver maior">
        {/* <img> cru: a origem é uma data URL, que o otimizador do Next não processa. */}
        <img src={data.dataUrl} alt={nome ?? "Criativo"} className="h-full w-full object-cover" />
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{nome ?? "Criativo"}</DialogTitle>
          </DialogHeader>
          <img src={data.dataUrl} alt={nome ?? "Criativo"} className="max-h-[70vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
