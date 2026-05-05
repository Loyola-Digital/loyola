import { useEffect, useState } from "react";

export interface BandBreakdown {
  count: number;
  pct: number;
  cplFaixa: number | null;
}

export interface CampaignBandRow {
  utmCampaign: string;
  campaignName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

export interface CampaignBandBreakdownResponse {
  rows: CampaignBandRow[];
  semDados: boolean;
}

export function useLeadScoringCampaignBreakdown(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days: number,
) {
  const [data, setData] = useState<CampaignBandBreakdownResponse | null>(null);
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
          `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/lead-scoring/campaign-breakdown?days=${days}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = (await response.json()) as CampaignBandBreakdownResponse;
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
