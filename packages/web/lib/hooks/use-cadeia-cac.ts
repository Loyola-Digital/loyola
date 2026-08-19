"use client";

/**
 * Story 44.9 — o payload da aba "Inácio" para uma etapa.
 *
 * ⚠️ Chama a rota INTERNA (`/api/projects/:projectId/stages/:stageId/cadeia-cac`),
 * não a pública. A pública exige `x-api-key` e o web autentica com Clerk — as
 * duas servem o MESMO payload, do mesmo serviço, com teste provando isso
 * (`cadeia-cac-rotas-equivalentes.test.ts`).
 *
 * ⚠️ Usa `useApiClient`, nunca `fetch` cru: em produção a Vercel bloqueia o
 * request direto com `DNS_HOSTNAME_RESOLVED_PRIVATE`, porque o backend mora em
 * outro hostname.
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { Metrica } from "@loyola-x/shared/src/cadeia-cac";

export interface CadeiaCacPayload {
  projectId: string;
  stageId: string;
  stageName: string;
  stageType: string | null;
  familia: "paga" | "gratuita" | null;
  fonte: "ad-level";
  spendIncludesMetaTax: boolean;
  unidadeDasTaxas: "decimal";
  range: { from: string | null; to: string | null };
  lpTemVsl: boolean | null;
  ticketMedioManual: number | null;

  /** Presentes só quando a etapa está fora da aba ou não tem série. */
  semDados?: boolean;
  motivo?: string;
  message?: string;

  campanhas?: {
    campaignId: string;
    campaignName: string | null;
    dias: number | null;
    motivo: string | null;
    lastSyncedAt: string | null;
  }[];
  agregado?: {
    spend: number;
    impressions: number;
    linkClicks: number;
    landingPageViews: number;
    checkouts: number;
    leadsAtribuidos: number | null;
    dias: number;
  };
  atuais?: Record<Metrica, number | null>;
  principal?: {
    metrica: "cacReal" | "cplReal";
    valor: number | null;
    spend: number;
    vendasReais?: number;
    leadsUnicos?: number;
    fonteDeLead?: string;
    motivo?: string;
    message?: string;
    dataSource?: string;
    computedAt?: string | null;
  };
  atribuicao?: {
    coberturaVendas: number | null;
    coberturaLeads: number | null;
    motivo: string;
    message: string;
  };
  vendasSemDataNoTotal?: number | null;
  tetos?: Record<
    Metrica,
    {
      metrica: Metrica;
      valor: number | null;
      motivo?: string;
      campaignId?: string;
      de?: string;
      ate?: string;
      base?: number;
      confianca?: "alta" | "baixa";
      fonte?: string;
      coberturaJanela?: number;
    }
  >;
  guardaDeCobertura?: {
    /** Story 44.12: quatro estados. `semLeadNoPeriodo` ≠ `indisponivel`. */
    estado: "aplicada" | "semLeadNoPeriodo" | "indisponivel" | "naoSeAplica";
    motivo: string | null;
    message: string | null;
    /** Dias com lead (`aplicada`) ou dias da série (`semLeadNoPeriodo`). */
    dias: number | null;
  };
  ranking?: { metrica: Metrica; atual: number; teto: number; queda: number; posicao: number }[];
  composto?: {
    rotulo: "cenario-teorico";
    queda: number | null;
    custoAtual: number | null;
    custoNoTeto: number | null;
    metricasDoTeto: Record<Metrica, number | null>;
  };
  decomposicaoCPC?: { soCtr: number | null; soCpm: number | null; ambos: number | null } | null;
  benchmarks?: {
    rotulo: "mediana-historica";
    medianas: Record<Metrica, number | null>;
    campanhasElegiveis: Record<Metrica, number>;
    medianaCustoDaCadeia: number | null;
    campanhasElegiveisCustoDaCadeia: number;
    campanhasComSerie: number;
  };
}

export function useCadeiaCac(
  projectId: string | undefined,
  stageId: string | undefined,
  range?: { from?: string; to?: string },
) {
  const api = useApiClient();
  const qs = new URLSearchParams();
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  const sufixo = qs.toString() ? `?${qs}` : "";

  return useQuery({
    queryKey: ["cadeia-cac", projectId, stageId, range?.from ?? null, range?.to ?? null],
    enabled: Boolean(projectId && stageId),
    queryFn: () =>
      api<CadeiaCacPayload>(`/api/projects/${projectId}/stages/${stageId}/cadeia-cac${sufixo}`),
    staleTime: 60_000,
  });
}
