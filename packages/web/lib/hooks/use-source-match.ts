"use client";

/**
 * Match de origem — leads sem `utm_source` e as regras que os recuperam.
 *
 * O diagnóstico e o agrupamento leem a planilha inteira; as regras não. Por
 * isso são queries separadas: editar uma regra não pode custar uma releitura
 * de planilha a cada clique.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type OperadorDeRegra = "igual" | "contem" | "comeca_com" | "vazio";

export interface RegraDeOrigem {
  id: string;
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
  origem: string;
  ordem: number;
  ativa: boolean;
}

export interface DiagnosticoDeOrigem {
  total: number;
  comOrigem: number;
  semOrigem: number;
  recuperadas: number;
  pago: number;
  organico: number;
  indefinido: number;
}

export interface GrupoDeOrfaos {
  valor: string;
  label: string;
  quantidade: number;
  exemplos: string[];
}

export interface GrupoParaClassificar {
  valor: string;
  label: string;
  quantidade: number;
  /** Grafias do mesmo canal, quando há mais de uma ("whatsapp" e "WhatsApp"). */
  variacoes: string[];
}

export interface RespostaDoDiagnostico {
  semPlanilha: boolean;
  diagnostico: DiagnosticoDeOrigem | null;
  colunas: string[];
  aClassificar: GrupoParaClassificar[];
  regras: RegraDeOrigem[];
}

/**
 * As regras de origem são do PROJETO.
 *
 * O `utm_source` "instagram" significa a mesma coisa em qualquer funil e em
 * qualquer etapa — classificar por etapa fazia a captação e a venda poderem
 * discordar sobre a mesma pessoa.
 *
 * O `funnelId` continua existindo, mas só para ESTREITAR o diagnóstico: dá para
 * olhar um funil de cada vez sem que a regra criada valha só para ele.
 */
function base(projectId: string) {
  return `/api/projects/${projectId}/source-match`;
}

/** `?funnelId=` quando se quer olhar um funil só. */
function escopo(funnelId?: string) {
  return funnelId ? `?funnelId=${encodeURIComponent(funnelId)}` : "";
}

export function useDiagnosticoDeOrigem(projectId: string, funnelId?: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["source-match", "diagnostico", projectId, funnelId ?? "todos"],
    queryFn: () =>
      apiClient<RespostaDoDiagnostico>(`${base(projectId)}/diagnostico${escopo(funnelId)}`),
    // A planilha é lida a cada chamada: um staleTime curto evita releitura a
    // cada foco de janela sem deixar o número velho na tela.
    staleTime: 2 * 60 * 1000,
  });
}

export function useOrfasPorCampo(
  projectId: string,
  funnelId: string | undefined,
  campo: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["source-match", "orfas", projectId, funnelId ?? "todos", campo],
    queryFn: () =>
      apiClient<{ grupos: GrupoDeOrfaos[] }>(
        `${base(projectId)}/orfas?campo=${encodeURIComponent(campo ?? "")}${
          funnelId ? `&funnelId=${encodeURIComponent(funnelId)}` : ""
        }`,
      ),
    enabled: !!campo,
    staleTime: 2 * 60 * 1000,
  });
}

export interface EntradaDeRegra {
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
  origem: string;
  ordem?: number;
  ativa?: boolean;
}

export function useCriarRegras(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regras: EntradaDeRegra | EntradaDeRegra[]) =>
      apiClient<{ regras: RegraDeOrigem[] }>(`${base(projectId)}/regras`, {
        method: "POST",
        body: JSON.stringify(regras),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

export function useAtualizarRegra(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<EntradaDeRegra> }) =>
      apiClient<{ regra: RegraDeOrigem }>(`${base(projectId)}/regras/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

export function useRemoverRegra(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`${base(projectId)}/regras/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

/**
 * Monta a origem a partir do canal digitado — o mesmo que o servidor faz.
 *
 * Replicado aqui só para a PRÉVIA ("vai ficar `organic_instagram`"). Quem grava
 * continua sendo o servidor: se as duas divergirem, vale a dele.
 */
export function montarOrigem(tipo: "pago" | "organico", canal: string): string {
  const limpo = canal
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${tipo === "pago" ? "paid" : "organic"}_${limpo}`;
}

// ============================================================
// Regras GLOBAIS — valem para todos os projetos
// ============================================================
//
// Vivem em Settings, não dentro de uma etapa. O caso que motivou é o link mal
// montado que entrega `{whatsapp}` — a macro com as chaves literais, sem
// substituição. Isso não é problema de um projeto nem de uma etapa: é do
// formato do link, e acontece igual em qualquer campanha.

const GLOBAL = "/api/source-match/regras-globais";

export function useRegrasGlobais() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["source-match", "globais"],
    queryFn: () => apiClient<{ regras: RegraDeOrigem[] }>(GLOBAL),
  });
}

export function useCriarRegraGlobal() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regra: EntradaDeRegra) =>
      apiClient<{ regras: RegraDeOrigem[] }>(GLOBAL, {
        method: "POST",
        body: JSON.stringify(regra),
      }),
    // Invalida `source-match` inteiro: a regra global muda o diagnóstico de
    // TODOS os projetos, não só a lista que está na tela.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

export function useRemoverRegraGlobal() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<void>(`${GLOBAL}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

/**
 * Testa um valor contra as regras, sem gravar.
 *
 * Substitui o diagnóstico que a aba antiga tinha ("46 leads sem origem"), que
 * dependia de uma etapa. Aqui não há etapa: o que responde a mesma pergunta é
 * poder colar `{whatsapp}` e ver no que ele vira.
 */
export function useTestarRegraGlobal() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (entrada: { campo: string; valor: string }) =>
      apiClient<{ origem: string | null; regraId: string | null; casou: boolean }>(
        `${GLOBAL}/testar`,
        { method: "POST", body: JSON.stringify(entrada) },
      ),
  });
}
