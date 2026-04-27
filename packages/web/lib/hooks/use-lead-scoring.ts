import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface LeadScoringRecord {
  id: string;
  stageId: string;
  surveyId: string | null;
  schemaJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BandResult {
  id: string;
  description: string;
  leads_scored: number;
  pct: number;
  cpl_ideal: number | null;
  cpl_breakeven: number | null;
  recommended_action: string;
}

export interface ProjectInfo {
  name?: string;
  ticket?: number;
  roas?: number;
  cpa_ceiling?: number;
}

export interface LeadScoringResults {
  project: ProjectInfo | null;
  total_leads_scored: number;
  unclassified: number;
  bands: BandResult[];
  cpl_global: number | null;
  semDados: boolean;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/lead-scoring`;
}

export function useLeadScoring(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-scoring", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<LeadScoringRecord | null>(base(projectId!, funnelId!, stageId!)),
    enabled: !!projectId && !!funnelId && !!stageId,
  });
}

export function useSaveLeadScoring(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { surveyId: string | null; schemaJson: Record<string, unknown> }) =>
      apiClient<LeadScoringRecord>(base(projectId, funnelId, stageId), {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["lead-scoring", projectId, funnelId, stageId],
      });
      queryClient.invalidateQueries({
        queryKey: ["lead-scoring-results", projectId, funnelId, stageId],
      });
    },
  });
}

export function useLeadScoringResults(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-scoring-results", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<LeadScoringResults>(`${base(projectId!, funnelId!, stageId!)}/results`),
    enabled: !!projectId && !!funnelId && !!stageId,
  });
}

export interface LeadScoringDebug {
  sheet_info: {
    spreadsheet_id: string;
    sheet_name: string;
    total_rows: number;
    total_headers: number;
  };
  headers: string[];
  per_question: Array<{
    id: string;
    label?: string;
    new_survey_column?: string;
    column_index: number;
    column_found: boolean;
    matched_count: number;
    unmapped_count: number;
    unmapped_default: number;
    unmapped_unique_values: Array<{ value: string; count: number }>;
  }>;
  sample_leads: Array<{
    row_idx: number;
    q4_filled: boolean;
    total_score: number;
    breakdown: Array<{ id: string; raw: string | null; points: number; matched: boolean }>;
  }>;
}

export function useLeadScoringDebug(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  enabled: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-scoring-debug", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<LeadScoringDebug>(`${base(projectId!, funnelId!, stageId!)}/debug`),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
  });
}
