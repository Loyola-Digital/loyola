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

export function useDeleteSalesMapping(projectId: string, productId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) =>
      apiClient(`/api/projects/${projectId}/sales/products/${productId}/mappings/${mappingId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-products", projectId] }); },
  });
}
