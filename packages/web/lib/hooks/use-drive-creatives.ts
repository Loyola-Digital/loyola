"use client";

/**
 * Criativos do Drive, indexados pelo nome do arquivo.
 *
 * O preview da Meta some quando a campanha é desligada — e é justamente aí que
 * alguém vai olhar o histórico. O Drive não some, então ele vem primeiro e a
 * Meta fica como reserva.
 *
 * A resposta é um mapa inteiro (e não um endpoint por anúncio) porque a galeria
 * mostra dezenas de cards; uma chamada por card viraria dezenas de idas ao
 * Drive a cada render.
 */

import { useCallback } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface DriveCriativo {
  url: string;
  view: string | null;
  tipo: "video" | "estatico";
  /** Pasta de onde o arquivo veio — a tela mostra pra dar rastreabilidade. */
  pasta: string;
  /** true = veio de "Com edição"; false = de "Ads". Nunca de "Sem edição". */
  editada: boolean;
}

export interface DriveCreativesResposta {
  criativos: Record<string, DriveCriativo>;
  total: number;
  /** true = Drive fora do ar ou sem acesso; a galeria cai na Meta. */
  indisponivel?: boolean;
}

/** Mesma normalização do servidor: sem acento, sem caixa, sem pontuação. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function useDriveCreatives(
  projectId: string | null,
  funnelId: string | null | undefined,
  stageId: string | null | undefined,
) {
  const apiClient = useApiClient();
  const q = useQuery({
    queryKey: ["drive-creatives", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<DriveCreativesResposta>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/drive-creatives`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    // A pasta de uma campanha não muda de lugar; o que expira é o link da
    // miniatura, e isso o refetch resolve.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  /**
   * Acha o criativo pelo nome do anúncio.
   *
   * Aceita a extensão a mais no arquivo e sufixos tipo `_v2` — a nomenclatura
   * do Drive segue a da Meta, mas ninguém renomeia o arquivo pra tirar o `.mp4`.
   */
  const urlDoAnuncio = useCallback(
    (nomeDoAnuncio: string | null | undefined): DriveCriativo | null => {
      const mapa = q.data?.criativos;
      if (!mapa || !nomeDoAnuncio) return null;
      const alvo = normalizar(nomeDoAnuncio);
      if (!alvo) return null;
      const semExt = (n: string) => normalizar(n.replace(/\.[a-z0-9]{2,5}$/i, ""));
      for (const [arquivo, dados] of Object.entries(mapa)) {
        if (semExt(arquivo) === alvo) return dados;
      }
      for (const [arquivo, dados] of Object.entries(mapa)) {
        if (semExt(arquivo).startsWith(alvo)) return dados;
      }
      return null;
    },
    [q.data],
  );

  return { ...q, urlDoAnuncio, total: q.data?.total ?? 0, indisponivel: q.data?.indisponivel ?? false };
}
