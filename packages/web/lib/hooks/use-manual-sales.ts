"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import type {
  CreateManualSaleInput,
  ManualSale,
  ManualSalesResponse,
} from "@loyola-x/shared";

const STALE_TIME = 30 * 1000;

/** Igual ao do api-client: as rotas de arquivo usam `fetch` cru. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function buildKey(projectId: string, funnelId: string, stageId: string, days: number) {
  return ["manual-sales", projectId, funnelId, stageId, days] as const;
}

/**
 * Invalida TODAS as queries que dependem de vendas manuais da etapa, pra a venda
 * aparecer na hora (sem F5): a lista bruta (manual-sales), a lista unificada
 * exibida na tela (all-sales) e o Mapa do Evento (event-map, status "comprou").
 * Prefixo parcial → cobre qualquer subtype/days.
 */
function invalidateSalesQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  for (const key of ["manual-sales", "all-sales", "event-map"]) {
    queryClient.invalidateQueries({ queryKey: [key, projectId, funnelId, stageId] });
  }
}

export interface EligibleSeller {
  userId: string;
  name: string;
  email: string;
}

/**
 * Vendedores elegíveis (owner + project_members) — usado no Select do
 * modal de venda manual. Necessário porque o owner do projeto não vira
 * row automática em project_members.
 */
export function useEligibleSellers(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["manual-sales-sellers", projectId],
    queryFn: () =>
      apiClient<EligibleSeller[]>(`/api/projects/${projectId}/manual-sales/sellers`),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

export function useManualSales(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["manual-sales", projectId, funnelId, stageId, days],
    queryFn: () =>
      apiClient<ManualSalesResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales?days=${days}`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}

export function useCreateManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateManualSaleInput) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export function useDeleteManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) =>
      apiClient<{ success: true }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export function useUpdateManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      saleId,
      input,
    }: {
      saleId: string;
      input: Partial<CreateManualSaleInput>;
    }) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

/**
 * Reembolso (Evento Presencial): marca a venda como reembolsada com motivo.
 * A venda continua na lista (histórico) mas sai dos totais de faturado/coletado.
 */
export function useRefundManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: string; reason: string }) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}/refund`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

/** Desfaz um reembolso lançado por engano. */
export function useUnrefundManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}/refund`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export { buildKey as buildManualSalesKey };

// ============================================================
// Story 19.9 ext — all-sales unificado (manual + planilha)
// ============================================================

export interface UnifiedSale {
  id: string;
  source: "manual" | "spreadsheet";
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  product: string | null;
  value: number;
  sellerName: string | null;
  saleDate: string | null;
  invoiceStatus: "emitida" | "pendente" | null;
  manualSaleId: string | null;
  /** Rótulo da fonte da venda (ex: "TMB"). null = sem rótulo especial. */
  sourceLabel: string | null;
  /** Story 19.10 — valor recebido (Caixa) e negociação (evento presencial). */
  valorRecebido: number | null;
  negociacao: string | null;
  /** Reembolso (Evento Presencial) — só vendas manuais podem ter. */
  refundedAt: string | null;
  refundReason: string | null;
}

export interface AllSalesResponse {
  sales: UnifiedSale[];
  summary: {
    totalSales: number;
    totalRevenue: number;
    manualSales: number;
    manualRevenue: number;
    spreadsheetSales: number;
    spreadsheetRevenue: number;
  };
}

export function useAllSales(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  // "all", um subtype único, ou lista CSV (ex: "main_product,tmb").
  // Vendas manuais sempre entram, independente do subtype.
  subtype: "capture" | "main_product" | "sales" | "tmb" | "all" | (string & {}),
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["all-sales", projectId, funnelId, stageId, subtype, days],
    queryFn: () =>
      apiClient<AllSalesResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/all-sales?subtype=${encodeURIComponent(subtype)}&days=${days}`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}

// ============================================================
// Comprovante da venda (print ou PDF)
// ============================================================

/**
 * Anexa o comprovante a uma venda já criada.
 *
 * Em duas etapas — cria a venda, depois anexa — e não num request só: a venda
 * entra por JSON e o arquivo por multipart. Juntar os dois obrigaria a mudar o
 * POST que já funciona, inclusive para quem lança venda sem comprovante nenhum.
 *
 * `fetch` cru porque o apiClient serializa JSON e sobrescreveria o
 * Content-Type, que precisa carregar o boundary do multipart.
 */
export function useAnexarComprovante(projectId: string, funnelId: string, stageId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleId, arquivo }: { saleId: string; arquivo: File }) => {
      const token = await getToken();
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}/receipt`,
        { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form },
      );
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corpo?.error ?? `Falha ao guardar o comprovante (${res.status})`);
      }
      return (await res.json()) as { ok: true; byteSize: number; mimeType: string };
    },
    onSuccess: () => invalidateSalesQueries(queryClient, projectId, funnelId, stageId),
  });
}

export function useRemoverComprovante(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}/receipt`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateSalesQueries(queryClient, projectId, funnelId, stageId),
  });
}

/**
 * Busca o comprovante como blob local.
 *
 * A rota exige o token no cabeçalho, então não dá para apontar um `<img src>`
 * direto para ela — o navegador não manda Authorization em carregamento de
 * imagem. O jeito é baixar autenticado e exibir por object URL.
 */
export function useBaixarComprovante(projectId: string, funnelId: string, stageId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (saleId: string): Promise<{ url: string; mimeType: string }> => {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}/receipt`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Não consegui carregar o comprovante.");
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), mimeType: blob.type };
    },
  });
}

/**
 * Baixa o CSV de todas as vendas manuais da etapa.
 *
 * O arquivo vem pronto do servidor (separador `;`, BOM, valores em formato
 * brasileiro) porque o destino é o Excel em português. Montar no navegador
 * exigiria refazer essa formatação aqui e mantê-la em dois lugares.
 */
export function useExportarVendasManuais(projectId: string, funnelId: string, stageId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/export.csv`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Falha ao gerar o CSV (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vendas-manuais-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Sem o revoke o blob fica na memória da aba até ela ser fechada.
      URL.revokeObjectURL(url);
    },
  });
}
