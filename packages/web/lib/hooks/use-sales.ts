"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ColumnMapping {
  email: string;
  date: string;
  origin?: string;
  type?: string;
  value?: string;
  name?: string;
  phone?: string;
  status?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface SalesMapping {
  id: string;
  productId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: ColumnMapping;
  createdAt: string;
}

export interface SalesProduct {
  id: string;
  projectId: string;
  name: string;
  type: "inferior" | "superior";
  createdAt: string;
  mappings: SalesMapping[];
}

export function useSalesProducts(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-products", projectId],
    queryFn: () => apiClient<{ products: SalesProduct[] }>(`/api/projects/${projectId}/sales/products`),
  });
}

export function useCreateSalesProduct(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: "inferior" | "superior" }) =>
      apiClient(`/api/projects/${projectId}/sales/products`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}

export function useDeleteSalesProduct(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      apiClient(`/api/projects/${projectId}/sales/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}

export function useAddSalesMapping(projectId: string, productId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { spreadsheetId: string; spreadsheetName: string; sheetName: string; columnMapping: ColumnMapping }) =>
      apiClient(`/api/projects/${projectId}/sales/products/${productId}/mappings`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}

export interface AscensionData {
  totalInferior: number;
  totalSuperior: number;
  totalAscended: number;
  conversionRate: number;
  avgDaysToAscend: number;
  distribution: { range: string; count: number }[];
  ascended: { email: string; inferiorDate: string; superiorDate: string; daysToAscend: number; inferiorProduct: string; superiorProduct: string; origin?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string }[];
  inferiorProducts: string[];
  superiorProducts: string[];
  revenueInferior: number;
  revenueSuperior: number;
  ticketMedioInferior: number;
  ticketMedioSuperior: number;
  ltvEstimado: number;
  cohort: { month: string; total: number; ascended: number; rate: number }[];
  topOrigins: { origin: string; total: number; ascended: number; rate: number }[];
  topCampaigns: { campaign: string; total: number; ascended: number; rate: number }[];
  timeline: { date: string; front: number; back: number }[];
  remarketing: { email: string; date: string; product: string; origin?: string; utm_source?: string; utm_campaign?: string }[];
}

export function useSalesAscension(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-ascension", projectId],
    queryFn: () => apiClient<{ data: AscensionData | null; message?: string }>(`/api/projects/${projectId}/sales/ascension`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSalesMapping(projectId: string, productId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mappingId, columnMapping }: { mappingId: string; columnMapping: ColumnMapping }) =>
      apiClient(`/api/projects/${projectId}/sales/products/${productId}/mappings/${mappingId}`, {
        method: "PUT",
        body: JSON.stringify({ columnMapping }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}

export function useDeleteSalesMapping(projectId: string, productId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) =>
      apiClient(`/api/projects/${projectId}/sales/products/${productId}/mappings/${mappingId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}
