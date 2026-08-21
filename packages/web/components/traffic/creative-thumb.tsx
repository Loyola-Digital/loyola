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

export function useCreativeThumb(projectId: string, adId: string | null | undefined) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["creative-thumb", projectId, adId],
    queryFn: async (): Promise<string | null> => {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/api/traffic/analytics/${projectId}/creative-thumb/${adId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      // 404 é rotina: criativo sem imagem guardada ainda. Não é erro para
      // repetir — devolvemos null e a célula mostra o placeholder.
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler a imagem"));
        reader.readAsDataURL(blob);
      });
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
  if (!data) {
    return (
      <div
        className={`${caixa} flex items-center justify-center bg-muted/30`}
        title="Sem miniatura guardada para este criativo"
      >
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={`${caixa} transition-opacity hover:opacity-80`} title="Ver maior">
        {/* <img> cru: a origem é uma data URL, que o otimizador do Next não processa. */}
        <img src={data} alt={nome ?? "Criativo"} className="h-full w-full object-cover" />
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{nome ?? "Criativo"}</DialogTitle>
          </DialogHeader>
          <img src={data} alt={nome ?? "Criativo"} className="max-h-[70vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
