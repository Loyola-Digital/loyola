import { useEffect, useState } from "react";

export interface BandBreakdown {
  count: number;
  pct: number;
  cplFaixa: number | null;
}

export interface AdsetBandRow {
  utmMedium: string;
  adsetName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

export interface AdsetBandBreakdownResponse {
  rows: AdsetBandRow[];
  semDados: boolean;
}

export function useLeadScoringAdsetBreakdown(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days: number,
) {
  const [data, setData] = useState<AdsetBandBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !funnelId || !stageId) {
      setData(null);
      setError(null);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/lead-scoring/adset-breakdown?days=${days}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = (await response.json()) as AdsetBandBreakdownResponse;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, funnelId, stageId, days]);

  return { data, loading, error };
}
