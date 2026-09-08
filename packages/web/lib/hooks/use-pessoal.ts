"use client";

/**
 * Pessoal (RH) — ficha, férias e ausências.
 *
 * Duas portas para o mesmo dado: `/me` para quem só quer a própria ficha e
 * `/:userId` para o admin. A separação é do servidor, não da tela — as
 * observações da liderança nem chegam ao navegador de quem não é admin.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type TipoDeAusencia = "ferias" | "folga" | "ausencia" | "licenca";
export type StatusDeAusencia =
  "programada" | "aprovada" | "concluida" | "cancelada";

export interface Ausencia {
  id: string;
  userId: string;
  kind: TipoDeAusencia;
  status: StatusDeAusencia;
  inicio: string;
  fim: string;
  dias: number;
  coberturaUserId: string | null;
  observacao: string | null;
}

export interface SaldoDeFerias {
  direito: number;
  gozados: number;
  ajuste: number;
  disponivel: number;
  periodos: number;
}

export interface Ficha {
  userId: string;
  nome: string;
  email: string;
  role: string;
  nomeCompleto: string | null;
  foto: string | null;
  /** A foto veio do PDI, não da ficha — a tela avisa. */
  fotoDoPdi: boolean;
  nascimento: string | null;
  telefone: string | null;
  emailContato: string | null;
  emergenciaNome: string | null;
  emergenciaTelefone: string | null;
  emergenciaParentesco: string | null;
  cargo: string | null;
  entradaEm: string | null;
  ajusteSaldoDias: number;
  /**
   * Dados de pagamento. Chegam do servidor SEM máscara — só dígitos, no caso
   * de CPF e CNPJ. Quem formata é a tela.
   */
  cpf: string | null;
  cnpj: string | null;
  chavePix: string | null;
  endereco: string | null;
  /** Só volta para admin. */
  observacoes?: string | null;
  temFicha: boolean;
}

export interface PessoaNaLista extends Ficha {
  saldo: SaldoDeFerias;
  ausenteAgora: boolean;
  proxima: Ausencia | null;
  totalAusencias: number;
}

export interface DetalheDaPessoa {
  ficha: Ficha;
  saldo: SaldoDeFerias;
  ausencias: Ausencia[];
}

export function usePessoas(habilitado = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pessoal", "lista"],
    queryFn: () => apiClient<{ pessoas: PessoaNaLista[] }>("/api/pessoal"),
    enabled: habilitado,
    staleTime: 60 * 1000,
  });
}

export function useMinhaFicha(habilitado = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pessoal", "me"],
    queryFn: () => apiClient<DetalheDaPessoa>("/api/pessoal/me"),
    enabled: habilitado,
    staleTime: 60 * 1000,
  });
}

export function usePessoa(userId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pessoal", "pessoa", userId],
    queryFn: () => apiClient<DetalheDaPessoa>(`/api/pessoal/${userId}`),
    enabled: !!userId,
  });
}

export type EntradaDaFicha = Partial<
  Pick<
    Ficha,
    | "nomeCompleto"
    | "foto"
    | "nascimento"
    | "telefone"
    | "emailContato"
    | "emergenciaNome"
    | "emergenciaTelefone"
    | "emergenciaParentesco"
    | "cargo"
    | "entradaEm"
    | "observacoes"
    | "cpf"
    | "cnpj"
    | "chavePix"
    | "endereco"
  >
> & { ajusteSaldoDias?: number };

export function useSalvarFicha(userId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: EntradaDaFicha) =>
      apiClient<{ ok: true }>(`/api/pessoal/${userId}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pessoal"] }),
  });
}

export interface EntradaDeAusencia {
  kind: TipoDeAusencia;
  status: StatusDeAusencia;
  inicio: string;
  fim: string;
  coberturaUserId?: string | null;
  observacao?: string | null;
}

export function useCriarAusencia(userId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: EntradaDeAusencia) =>
      apiClient<{ ausencia: Ausencia }>(`/api/pessoal/${userId}/ausencias`, {
        method: "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pessoal"] }),
  });
}

export function useAtualizarAusencia() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dados,
    }: {
      id: string;
      dados: Partial<EntradaDeAusencia>;
    }) =>
      apiClient<{ ausencia: Ausencia }>(`/api/pessoal/ausencias/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pessoal"] }),
  });
}

export function useRemoverAusencia() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/pessoal/ausencias/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pessoal"] }),
  });
}

/**
 * O time no recorte que todo mundo pode ver.
 *
 * Rota separada da de admin de propósito: `/api/pessoal` devolve telefone,
 * contato de emergência e saldo de férias. Recortar no servidor é o que
 * resiste — filtrar na tela deixaria o dado trafegando igual.
 */
export interface PessoaNoDiretorio {
  userId: string;
  nome: string;
  nomeCompleto: string | null;
  email: string;
  cargo: string | null;
  entradaEm: string | null;
  foto: string | null;
  temFicha: boolean;
}

export function useDiretorioDoTime() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["pessoal", "time"],
    queryFn: () =>
      apiClient<{ pessoas: PessoaNoDiretorio[] }>("/api/pessoal/time"),
    // O diretório muda quando alguém entra ou troca de cargo — nenhuma das
    // duas acontece no meio de uma sessão.
    staleTime: 5 * 60 * 1000,
  });
}
