"use client";

/**
 * Lê um comprovante (print ou PDF) e devolve os campos da venda de ingresso
 * preenchidos. Nada é gravado aqui: o resultado vai pro formulário e a pessoa
 * confirma — a gravação continua sendo o POST normal de venda manual.
 */

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface DadosComprovante {
  customerName: string | null;
  value: number | null;
  /** AAAA-MM-DD */
  saleDate: string | null;
  paymentMethod: string | null;
  customerCpf: string | null;
  customerPhone: string | null;
  /** Campos que a IA não conseguiu ler — a UI destaca pra pessoa preencher. */
  camposNaoEncontrados: string[];
}

export const MIMES_ACEITOS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export function useExtrairComprovante(projectId: string, funnelId: string, stageId: string) {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (arquivo: File): Promise<DadosComprovante> => {
      // FormData exige fetch cru: o apiClient serializa JSON e sobrescreveria o
      // Content-Type (que precisa carregar o boundary do multipart).
      const token = await getToken();
      const form = new FormData();
      form.append("file", arquivo);

      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/extract-receipt`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: form,
        },
      );

      const json = (await res.json().catch(() => null)) as
        | { dados?: DadosComprovante; error?: string }
        | null;

      if (!res.ok || !json?.dados) {
        throw new Error(json?.error ?? "Não consegui ler o comprovante");
      }
      return json.dados;
    },
  });
}
