"use client";

// ============================================================
// Story 42.5 — Detalhamento da etapa Lyrio.
//
// Mesma leitura do Detalhamento do Perpétuo (`perpetual-dashboard.tsx:2596`),
// recortada para o que a etapa mobile sustenta hoje:
//
//   • SÓ colunas de mídia. Faturamento, ROAS, CAC e Margem exigem atribuir a
//     venda do RevenueCat a um anúncio, e o rastreio atual não sustenta isso —
//     medido em 2026-08-14: das 67 vendas, nenhuma carrega id de anúncio da
//     Meta. Coluna que mostra 0 se lê como "não vende", não como "não sabemos".
//     Ver Story 42.6 (extração da atribuição) e 42.7 (as colunas de receita).
//
//   • Google Ads só no nível de CAMPANHA. Os hooks de público e criativo do
//     Google aceitam um pai por chamada — cobrir os 3 níveis seria N+1 sem
//     lote nem cache, contra a regra que ficou após o rate limit de julho/2026.
// ============================================================

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTrafficCampaigns, useAllAdSets, useAllAds,
} from "@/lib/hooks/use-traffic-analytics";
import { useGoogleAdsCampaigns, type GoogleAdsCampaign } from "@/lib/hooks/use-google-ads-analytics";
import {
  buildCampaignRows, metaRow, sortRows, totalSpend,
  type LyrioDetailRow, type LyrioSortKey, type MetaEntityInput,
} from "@/lib/utils/lyrio-detail-rows";

type Dimensao = "campaign" | "adset" | "ad";

interface LyrioDetailTableProps {
  projectId: string;
  /** Ids das campanhas Meta vinculadas à etapa. */
  campaignIds: string[];
  /** Conta do Google salva na etapa (`stage.googleAdsAccountId`). */
  googleAccountId: string | null;
  /** Ids das campanhas Google vinculadas à etapa. */
  googleCampaignIds: Set<string>;
  /** Janela do DayRangePicker do cabeçalho da etapa. */
  days: number;
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function LyrioDetailTable({
  projectId,
  campaignIds,
  googleAccountId,
  googleCampaignIds,
  days,
}: LyrioDetailTableProps) {
  const [dimensao, setDimensao] = useState<Dimensao>("campaign");
  const [sortKey, setSortKey] = useState<LyrioSortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const temMeta = campaignIds.length > 0;
  const temGoogle = googleCampaignIds.size > 0 && !!googleAccountId;
  const campaignIdSet = useMemo(() => new Set(campaignIds), [campaignIds]);

  // Só a dimensão ativa consulta — trocar de aba troca o hook habilitado.
  //
  // Assimetria herdada dos hooks, e é fácil errar: `useTrafficCampaigns` NÃO
  // aceita `campaignIds` (traz todas as campanhas do projeto, filtro é aqui);
  // `useAllAdSets` e `useAllAds` filtram no servidor.
  const { data: campanhas, isLoading: loadingCampanhas } = useTrafficCampaigns(
    temMeta && dimensao === "campaign" ? projectId : null,
    days,
  );
  const { data: publicos, isLoading: loadingPublicos } = useAllAdSets(
    temMeta && dimensao === "adset" ? projectId : null,
    days,
    campaignIds,
  );
  const { data: criativos, isLoading: loadingCriativos } = useAllAds(
    temMeta && dimensao === "ad" ? projectId : null,
    days,
    campaignIds,
  );
  const { data: googleData, isLoading: loadingGoogle } = useGoogleAdsCampaigns(
    temGoogle && dimensao === "campaign" ? googleAccountId : null,
    days,
  );

  const loading =
    (dimensao === "campaign" && (loadingCampanhas || loadingGoogle)) ||
    (dimensao === "adset" && loadingPublicos) ||
    (dimensao === "ad" && loadingCriativos);

  const rows: LyrioDetailRow[] = useMemo(() => {
    if (dimensao === "campaign") {
      const metaEntities: MetaEntityInput[] = (campanhas?.campaigns ?? []).filter((c) =>
        campaignIdSet.has(c.campaignId),
      );
      const googleCampanhas: GoogleAdsCampaign[] = (googleData?.campaigns ?? []).filter((c) =>
        googleCampaignIds.has(c.id),
      );
      return buildCampaignRows(metaEntities, googleCampanhas);
    }
    // Público e criativo já vêm filtrados pelo servidor. `/all-ads` agrega por
    // Ad Name no backend — não reagrupar aqui.
    const fonte = dimensao === "adset" ? (publicos?.adsets ?? []) : (criativos?.ads ?? []);
    return fonte.map(metaRow);
  }, [dimensao, campanhas, googleData, publicos, criativos, campaignIdSet, googleCampaignIds]);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const total = useMemo(() => totalSpend(rows), [rows]);

  function toggleSort(key: LyrioSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function seta(key: LyrioSortKey): string {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  // Hook e Hold só existem a nível de anúncio — somem nas outras dimensões em
  // vez de virar "—" (mesmo tratamento do Perpétuo).
  const mostraVideo = dimensao === "ad";
  const colunas = 7 + (mostraVideo ? 2 : 0);

  const th = "text-right px-2 cursor-pointer select-none hover:text-foreground";

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Detalhamento
          <span className="font-normal text-muted-foreground">· últimos {days} dias</span>
        </h3>
        <Select value={dimensao} onValueChange={(v) => setDimensao(v as Dimensao)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Por Campanha</SelectItem>
            <SelectItem value="adset">Por Publico</SelectItem>
            <SelectItem value="ad">Por Criativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sem este aviso o total encolhe ao trocar de aba, e isso se lê como
          queda de investimento em vez de recorte da tela. */}
      {temGoogle && dimensao !== "campaign" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Público e criativo cobrem apenas o Meta. As {googleCampaignIds.size}{" "}
          {googleCampaignIds.size === 1 ? "campanha do Google aparece" : "campanhas do Google aparecem"}{" "}
          em “Por Campanha”.
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-2 pr-3 select-none">Plataforma</th>
                <th
                  className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  Dimensao{seta("name")}
                </th>
                <th className={th} onClick={() => toggleSort("spend")} title="Meta já com o imposto de 12,15%; Google sem imposto (o imposto é da Meta)">
                  Investimento{seta("spend")}
                </th>
                <th className={th} onClick={() => toggleSort("impressions")}>
                  Impressoes{seta("impressions")}
                </th>
                <th className={th} onClick={() => toggleSort("clicks")} title="Cliques no link quando a plataforma reporta; senão, cliques totais">
                  Cliques{seta("clicks")}
                </th>
                <th className={th} onClick={() => toggleSort("ctr")} title="Cliques ÷ Impressões × 100">
                  CTR{seta("ctr")}
                </th>
                <th className={th} onClick={() => toggleSort("cpc")} title="Investimento ÷ Cliques">
                  CPC{seta("cpc")}
                </th>
                <th className={th} onClick={() => toggleSort("cpm")} title="Investimento ÷ Impressões × 1000">
                  CPM{seta("cpm")}
                </th>
                {mostraVideo && (
                  <>
                    <th className={th} onClick={() => toggleSort("hookRate")} title="Visualizações 3s ÷ Impressões × 100 — dos que viram o anúncio, quantos assistiram os primeiros segundos">
                      Hook{seta("hookRate")}
                    </th>
                    <th className={th} onClick={() => toggleSort("holdRate")} title="Visualizações 75% ÷ Visualizações 3s × 100 — dos que passaram pelo gancho, quantos seguiram até 75% do vídeo">
                      Hold{seta("holdRate")}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colunas + 1} className="py-6 text-center text-muted-foreground">
                    Nenhuma campanha com veiculação no período.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={`${r.platform}-${r.id}`} className="border-b border-border/10 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <span
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                          (r.platform === "meta"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")
                        }
                        title={r.status ? `Status: ${r.status}` : undefined}
                      >
                        {r.platform === "meta" ? "Meta" : "Google"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 max-w-[280px] truncate" title={r.name}>
                      {r.name}
                    </td>
                    <td className="text-right px-2 font-medium">{fmtBRL(r.spend)}</td>
                    <td className="text-right px-2">{fmtNum(r.impressions)}</td>
                    <td className="text-right px-2">{fmtNum(r.clicks)}</td>
                    <td className="text-right px-2">{fmtPct(r.ctr)}</td>
                    <td className="text-right px-2">{fmtBRL(r.cpc)}</td>
                    <td className="text-right px-2">{fmtBRL(r.cpm)}</td>
                    {mostraVideo && (
                      <>
                        <td className="text-right px-2">{fmtPct(r.hookRate)}</td>
                        <td className="text-right px-2">{fmtPct(r.holdRate)}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t border-border/30 font-medium">
                  <td className="py-2 pr-3" colSpan={2}>
                    Total ({sorted.length} {sorted.length === 1 ? "linha" : "linhas"})
                  </td>
                  <td className="text-right px-2">{fmtBRL(total)}</td>
                  <td colSpan={colunas - 2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* A ausência é declarada, não silenciosa: sem esta nota a primeira
          pergunta de quem abre a tela é "cadê o ROAS". */}
      <p className="text-[11px] text-muted-foreground">
        Faturamento, ROAS e CAC por linha dependem de atribuir cada venda do RevenueCat a um
        anúncio. O rastreio atual não sustenta isso — ver Story 42.6.
      </p>
    </div>
  );
}
