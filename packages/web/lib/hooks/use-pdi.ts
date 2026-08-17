"use client";

/**
 * PDI — Plano de Desenvolvimento Individual.
 *
 * `useMeuPdi` traz o documento da própria pessoa; `usePdiExiste` só diz se
 * existe, e é o que decide a tela inicial do app — carregar o HTML inteiro em
 * todo boot só pra escolher uma rota seria desperdício.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PdiDocumento {
  id: string;
  title: string;
  html: string;
  createdAt: string;
}

export interface PdiListaItem {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface PdiUsuario {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useMeuPdi() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pdi", "me"],
    queryFn: () => apiClient<{ pdi: PdiDocumento | null }>("/api/pdi/me"),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Gate do redirect inicial. `staleTime: Infinity` porque PDI não é atribuído no
 * meio da navegação da própria pessoa — refazer essa chamada a cada troca de
 * tela só atrasaria o boot.
 */
export function usePdiExiste() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pdi", "me", "exists"],
    queryFn: () => apiClient<{ exists: boolean }>("/api/pdi/me/exists"),
    staleTime: Infinity,
  });
}

export function usePdiLista(habilitado = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pdi", "lista"],
    queryFn: () => apiClient<{ documentos: PdiListaItem[] }>("/api/pdi"),
    enabled: habilitado,
  });
}

export function usePdiUsuariosAtribuiveis(habilitado = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pdi", "usuarios"],
    queryFn: () => apiClient<{ usuarios: PdiUsuario[] }>("/api/pdi/assignable-users"),
    enabled: habilitado,
  });
}

export function usePdiPorId(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pdi", "doc", id],
    queryFn: () => apiClient<{ pdi: PdiDocumento & { userId: string } }>(`/api/pdi/${id}`),
    enabled: !!id,
  });
}

export function useAtribuirPdi() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; title: string; html: string }) =>
      apiClient<{ pdi: { id: string; createdAt: string } }>("/api/pdi", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdi"] });
    },
  });
}

export function useRemoverPdi() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<void>(`/api/pdi/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdi"] });
    },
  });
}
