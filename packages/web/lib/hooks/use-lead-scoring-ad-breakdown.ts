import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface BandBreakdown {
  count: number;
  pct: number;
  cplFaixa: number | null;
}

export interface AdBandRow {
  utmContent: string;
  adName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

export interface AdBandBreakdownResponse {
  rows: AdBandRow[];
  semDados: boolean;
}

export function useLeadScoringAdBreakdown(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days: number,
) {
  const apiClient = useApiClient();
  const [data, setData] = useState<AdBandBreakdownResponse | null>(null);
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
        // `fetch` relativo chamava o domínio do FRONT, não a API — e sem o
        // token do Clerk. O Vercel não tem esta rota, então o navegador recebia
        // 404 do Next e a tabela mostrava "Erro ao carregar breakdown: HTTP 404".
        // `useApiClient` resolve as duas coisas, como nos outros 115 hooks.
        const result = await apiClient<AdBandBreakdownResponse>(
          `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/lead-scoring/ad-breakdown?days=${days}`,
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, funnelId, stageId, days, apiClient]);

  return { data, loading, error };
}
