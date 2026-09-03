"use client";

/**
 * Sobe uma imagem para dentro do mapa de funil.
 *
 * ## Não passa pelo Swipe Files
 *
 * Mesmo bucket, mas rota própria e prefixo `mapa/` — e, principalmente,
 * nenhuma linha em `swipe_files`. A biblioteca de referências lista da tabela,
 * nunca do bucket, então um print de página colado num mapa não vira
 * referência do acervo do time.
 *
 * ## Fetch cru, e não o apiClient
 *
 * Multipart precisa que o browser monte o `boundary` sozinho. Passar pelo
 * cliente comum poria um `Content-Type: application/json` que quebra o upload.
 */

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ImagemNoBucket {
  url: string;
  key: string;
  bytes: number;
  mime?: string;
}

/** Tipos que o bloco desenha. Espelha o que o servidor aceita. */
export const IMAGENS_ACEITAS = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
export const PDF = "application/pdf";
/** Imagem e PDF. Vídeo fica fora — ver a rota. */
export const ANEXOS_ACEITOS = [...IMAGENS_ACEITAS, PDF];

export function useSubirImagemDoMapa() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (arquivo: File): Promise<ImagemNoBucket> => {
      if (!ANEXOS_ACEITOS.includes(arquivo.type)) {
        throw new Error(
          `${arquivo.type || "Esse arquivo"} não entra no mapa. Vale imagem ou PDF.`,
        );
      }

      const token = await getToken();
      const form = new FormData();
      form.append("file", arquivo);

      // Um teto de tempo: sem ele, uma conexão que fica aberta sem mandar nada
      // deixa o bloco em "carregando" para sempre, e ninguém sabe se pode
      // tentar de novo.
      const relogio = new AbortController();
      const prazo = setTimeout(() => relogio.abort(), 2 * 60 * 1000);

      try {
        const r = await fetch(`${API_URL}/api/funnel-maps/imagem`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
          signal: relogio.signal,
        });

        if (!r.ok) {
          const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(corpo?.error ?? "Não consegui subir a imagem.");
        }
        return (await r.json()) as ImagemNoBucket;
      } catch (e) {
        if (relogio.signal.aborted) throw new Error("A imagem demorou demais para subir.");
        throw e;
      } finally {
        clearTimeout(prazo);
      }
    },
  });
}

/**
 * A primeira imagem de um `DataTransfer` — do Ctrl+V ou do arrastar.
 *
 * Colar de um editor traz o print como item de arquivo; arrastar do Finder ou
 * do Explorer traz em `files`. Os dois caminhos passam por aqui para a tela
 * não ter duas versões da mesma checagem.
 */
export function imagemDoEvento(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files)) {
    if (ANEXOS_ACEITOS.includes(f.type)) return f;
  }
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f && ANEXOS_ACEITOS.includes(f.type)) return f;
  }
  return null;
}
