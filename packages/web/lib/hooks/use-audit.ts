"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface AuditSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  messageCount: number;
  conversationCount: number;
}

export interface AuditByUser {
  userId: string;
  userName: string;
  userEmail: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  messageCount: number;
  conversationCount: number;
}

export interface AuditByMind {
  mindId: string;
  mindName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messageCount: number;
}

export interface AuditTimelineEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AuditData {
  period: { days: number; startDate: string; endDate: string };
  summary: AuditSummary;
  byUser: AuditByUser[];
  byMind: AuditByMind[];
  timeline: AuditTimelineEntry[];
}

export function useTokenAudit(days: number) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["token-audit", days],
    queryFn: () => apiClient<AuditData>(`/api/admin/audit/tokens?days=${days}`),
    staleTime: 60 * 1000,
  });
}
