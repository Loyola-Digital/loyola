"use client";

// ============================================================
// Story 42.5 — Detalhamento da etapa Lyrio.
//
// Mesma leitura do Detalhamento do Perpétuo (`perpetual-dashboard.tsx:2596`),
// recortada para o que a etapa mobile sustenta hoje:
//
//   • Colunas de mídia + VENDAS e RECEITA da Meta (Story 42.12, AC5). Até
//     09/10/2026 nenhuma venda do RevenueCat carregava id de anúncio da Meta
//     (medido em 14/08: 0 de 67); desde então o app manda `meta_*_id`/nome, e
//     a rota `vendas-por-canal` devolve a quebra por campanha (id) e por
//     conjunto/anúncio (NOME, a mesma chave com que `/all-adsets` e `/all-ads`
//     agregam). Linha do Google mostra "—": o Google não manda campanha. Venda
//     da Meta que não casa com nenhuma linha aparece em "Sem linha nesta
//     tabela", e a sem atributo em "<nível> não identificado" (42.13) — o total da
//     Meta fecha na tabela. ROAS, CAC e Margem por linha seguem fora (não
//     pedidos na 42.12).
//
//     Isso inclui BODY CONV. (vendas ÷ views 75%) e TX CONVERSÃO (vendas ÷
//     cliques no link), que o Detalhamento do Perpétuo tem em Por Criativo
//     (perpetual-dashboard.tsx:2670,2677). As duas têm Vendas no numerador, e
//     Vendas por anúncio é exatamente o que falta aqui — mostrariam "—" em
//     100% das linhas. Se você veio procurar por elas, o motivo é este.
//
//   • Cliques, CTR e CPC são os de LINK CLICK, com a mesma regra do Perpétuo
//     (`ctrDeLink`/`cpcDeLink` do shared, via lyrio-detail-rows.ts) — e sem
//     fallback para cliques totais desde a Story 29.77: linha da Meta sem
//     `link_click` mostra "—" nas três. O rótulo diz "(link)" para não mandar
//     ninguém procurar uma coluna que já está na tela. Ressalva que o
//     Perpétuo não tem: as linhas do Google são cliques da campanha, que não
//     são cliques em link — daí o tooltip separar as duas origens em vez de
//     prometer "link" para a tabela inteira.
//
//   • Story 42.16 — as linhas do Google somam o `/daily` por campanha na
//     régua de SP (a MESMA consulta do Resumo e do bloco Google, que o pai
//     repassa), com CTR/CPC/CPM recalculados da soma (D16). E o filtro
//     "Plataforma: Todas · Meta · Google" (AC4): a plataforma fora do filtro
//     não consulta, e com Google só "Por Campanha" fica habilitada.
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
  useTrafficCampaigns, useAllAdSets, useAllAds, useAdCreatives,
} from "@/lib/hooks/use-traffic-analytics";
import { useGoogleAdsCampaigns } from "@/lib/hooks/use-google-ads-analytics";
import { CreativeThumb } from "@/components/traffic/creative-thumb";
import { useRevenuecatVendasPorCanal } from "@/lib/hooks/use-revenuecat";
import {
  declaracaoDeCobertura,
  estadoDasVendasPorCanal,
  rotuloDoNaoIdentificado,
  vendasDoDetalhamento,
  type ContagemDeVendas,
} from "@/lib/utils/vendas-por-canal-lyrio";
import { avisoDoGoogleEmLinha } from "@/lib/utils/lyrio-google-ads";
import { comoEstadoDoGoogle, type TrafegoDoGoogleNaRegua } from "@/lib/utils/google-ads-na-regua";
import {
  buildCampaignRows, campanhasDoGoogleNaRegua, consultasDoDetalhamento, dimensaoDoFiltro, dimensoesHabilitadas,
  linhasDoFiltro, metaRow, mostraAvisoDoGoogle, rodapeDoFiltro, sortRows, totalSpend, DICA_DO_GOOGLE_SO_CAMPANHA,
  type LyrioDetailRow, type LyrioSortKey, type MetaEntityInput, type PlataformaDoDetalhamento,
} from "@/lib/utils/lyrio-detail-rows";
import type { FunnelCampaign } from "@loyola-x/shared";

type Dimensao = "campaign" | "adset" | "ad";

interface LyrioDetailTableProps {
  projectId: string;
  /** Story 42.12 — para a rota `vendas-por-canal` da etapa. */
  funnelId: string;
  stageId: string;
  /** Câmbio US$ → R$ (a receita do RevenueCat vem em dólar). */
  brlRate: number | null;
  /** Sem RevenueCat conectado não há venda a cruzar — as colunas somem. */
  revenuecatConectado: boolean;
  /** Ids das campanhas Meta vinculadas à etapa. */
  campaignIds: string[];
  /** Conta do Google salva na etapa (`stage.googleAdsAccountId`). */
  googleAccountId: string | null;
  /** Ids das campanhas Google vinculadas à etapa. */
  googleCampaignIds: Set<string>;
  /** Story 42.16 (PO-03): as campanhas Google da etapa — o NOME da linha (`stage.googleAdsCampaigns`). */
  googleCampanhas: FunnelCampaign[];
  /**
   * Story 42.16 (AC4f): o tráfego do Google na régua de SP, por campanha — a
   * MESMA consulta do Resumo e do bloco Google. Já traz a decisão da conta
   * (42.13, QA loop): sem conta é aviso, não linha a menos calada.
   */
  googleTrafego: TrafegoDoGoogleNaRegua;
  /** Janela do DayRangePicker do cabeçalho da etapa. */
  days: number;
}

function fmtBRL(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function LyrioDetailTable({
  projectId,
  funnelId,
  stageId,
  brlRate,
  revenuecatConectado,
  campaignIds,
  googleAccountId,
  googleCampaignIds,
  googleCampanhas,
  googleTrafego,
  days,
}: LyrioDetailTableProps) {
  // AC4g: nem a plataforma nem a dimensão persistem entre visitas.
  const [plataforma, setPlataforma] = useState<PlataformaDoDetalhamento>("todas");
  const [dimensaoEscolhida, setDimensao] = useState<Dimensao>("campaign");
  const dimensao = dimensaoDoFiltro(plataforma, dimensaoEscolhida);
  const [sortKey, setSortKey] = useState<LyrioSortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const temMeta = campaignIds.length > 0;
  const temGoogle = googleCampaignIds.size > 0 && !!googleAccountId;
  const campaignIdSet = useMemo(() => new Set(campaignIds), [campaignIds]);

  // Só a dimensão ativa consulta — trocar de aba troca o hook habilitado. E
  // só a plataforma do filtro consulta (Story 42.16, AC4b/AC4c).
  const liga = consultasDoDetalhamento(plataforma, dimensao, { meta: temMeta, google: temGoogle });
  //
  // Assimetria herdada dos hooks, e é fácil errar: `useTrafficCampaigns` NÃO
  // aceita `campaignIds` (traz todas as campanhas do projeto, filtro é aqui);
  // `useAllAdSets` e `useAllAds` filtram no servidor.
  const { data: campanhas, isLoading: loadingCampanhas } = useTrafficCampaigns(
    liga.metaCampanhas ? projectId : null,
    days,
  );
  const { data: publicos, isLoading: loadingPublicos } = useAllAdSets(
    liga.metaPublicos ? projectId : null,
    days,
    campaignIds,
  );
  const { data: criativos, isLoading: loadingCriativos } = useAllAds(
    liga.metaCriativos ? projectId : null,
    days,
    campaignIds,
  );
  // PO-03: esta consulta fica SÓ pelo status da campanha (não é métrica de
  // janela); nenhuma métrica dela entra na tabela. As métricas do Google são
  // as de `googleTrafego` (a régua de SP). Em erro, a linha só perde o status.
  const { data: googleStatusData } = useGoogleAdsCampaigns(liga.googleStatus ? googleAccountId : null, days);
  const statusPorId = useMemo(
    () => new Map((googleStatusData?.campaigns ?? []).map((c) => [c.id, c.status] as [string, string])),
    [googleStatusData],
  );
  const googleNoFiltro = temGoogle && plataforma !== "meta";
  const loadingGoogle = googleNoFiltro && googleTrafego.tipo === "carregando";

  const loading =
    (dimensao === "campaign" && (loadingCampanhas || loadingGoogle)) ||
    (dimensao === "adset" && loadingPublicos) ||
    (dimensao === "ad" && loadingCriativos);

  const rows: LyrioDetailRow[] = useMemo(() => {
    if (dimensao === "campaign") {
      const metaEntities: MetaEntityInput[] = (campanhas?.campaigns ?? []).filter((c) =>
        campaignIdSet.has(c.campaignId),
      );
      const google =
        googleNoFiltro && googleTrafego.tipo === "pronto"
          ? campanhasDoGoogleNaRegua(googleCampanhas.filter((c) => googleCampaignIds.has(c.id)), googleTrafego.porCampanha, statusPorId)
          : [];
      return linhasDoFiltro(buildCampaignRows(metaEntities, google), plataforma);
    }
    // Público e criativo já vêm filtrados pelo servidor. `/all-ads` agrega por
    // Ad Name no backend — não reagrupar aqui.
    const fonte = dimensao === "adset" ? (publicos?.adsets ?? []) : (criativos?.ads ?? []);
    return linhasDoFiltro(fonte.map(metaRow), plataforma);
  }, [dimensao, plataforma, campanhas, publicos, criativos, campaignIdSet, googleCampaignIds, googleCampanhas, googleTrafego, googleNoFiltro, statusPorId]);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const total = useMemo(() => totalSpend(rows), [rows]);

  // Story 42.12 (AC5) — vendas da Meta por linha, na MESMA janela (`days`).
  // "oculto" (API anterior à rota) → as colunas não aparecem, como antes.
  const vendasQ = useRevenuecatVendasPorCanal(projectId, funnelId, stageId, days, revenuecatConectado && temMeta);
  const estadoVendas = estadoDasVendasPorCanal({ isLoading: vendasQ.isLoading, error: vendasQ.error, data: vendasQ.data });
  const mostraVendas = revenuecatConectado && temMeta && estadoVendas.tipo !== "oculto";
  const vendas = useMemo(
    () => (estadoVendas.tipo === "pronto" ? vendasDoDetalhamento(dimensao, rows, estadoVendas.dados) : null),
    [estadoVendas, dimensao, rows],
  );
  /** "—" para Google, para carregando/erro; número para linha da Meta com dado. */
  const vendasDaLinha = (r: LyrioDetailRow): ContagemDeVendas | null =>
    r.platform === "meta" && vendas ? (vendas.porLinha.get(`${r.platform}-${r.id}`) ?? null) : null;
  const naoIdentificado = rotuloDoNaoIdentificado(dimensao);
  // AC4d — o rodapé segue o filtro: com Google, as linhas de venda da Meta somem.
  const rodape = rodapeDoFiltro(plataforma, vendas);
  // Story 42.13 (QA loop) + 42.16 (AC4e): a conta decide primeiro, depois a
  // consulta do `/daily`; o aviso só aparece com o Google no filtro.
  const avisoGoogle =
    dimensao === "campaign" && mostraAvisoDoGoogle(plataforma) ? avisoDoGoogleEmLinha(comoEstadoDoGoogle(googleTrafego)) : null;
  const receitaBrl = (c: ContagemDeVendas | null) =>
    c == null || brlRate == null ? null : c.receitaUsd * brlRate;

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
  /**
   * Criativos dos anúncios listados, só para saber quais são vídeo.
   *
   * Vem do cache do backend (`ad-creatives`), não da Meta: é a mesma fonte que
   * a galeria de criativos usa. Sem isto a prévia abriria sempre como imagem
   * parada, e vídeo é justamente o que o time precisa assistir para julgar.
   */
  const adIdsVisiveis = useMemo(
    () => (dimensao === "ad" ? sorted.filter((r) => r.platform === "meta").map((r) => r.id) : []),
    [dimensao, sorted],
  );
  const { data: creativesData } = useAdCreatives(projectId, adIdsVisiveis);
  const videoPorAd = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of creativesData?.creatives ?? []) {
      if (c.objectType === "VIDEO") m.set(c.adId, c.videoId ?? null);
    }
    return m;
  }, [creativesData]);

  const mostraVideo = dimensao === "ad";
  // A miniatura só faz sentido por criativo: campanha e público não têm imagem.
  const mostraPreview = dimensao === "ad";
  const colunas = 7 + (mostraVideo ? 2 : 0) + (mostraPreview ? 1 : 0) + (mostraVendas ? 2 : 0);

  const th = "text-right px-2 cursor-pointer select-none hover:text-foreground";

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Detalhamento
          <span className="font-normal text-muted-foreground">· últimos {days} dias</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Story 42.16 (AC4a) — o filtro de plataforma, ao lado das abas de dimensão. */}
          <Select
            value={plataforma}
            onValueChange={(v) => {
              const p = v as PlataformaDoDetalhamento;
              setPlataforma(p);
              // AC4c: quem estava em Público ou Criativo volta para Campanha.
              setDimensao((d) => dimensaoDoFiltro(p, d));
            }}
          >
            <SelectTrigger className="w-[170px] h-8 text-xs" aria-label="Plataforma">
              <span className="text-muted-foreground">Plataforma:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dimensao} onValueChange={(v) => setDimensao(v as Dimensao)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign">Por Campanha</SelectItem>
              {(["adset", "ad"] as const).map((d) => {
                const habilitada = dimensoesHabilitadas(plataforma).includes(d);
                return (
                  <SelectItem key={d} value={d} disabled={!habilitada} title={habilitada ? undefined : DICA_DO_GOOGLE_SO_CAMPANHA}>
                    {d === "adset" ? "Por Público" : "Por Criativo"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AC4c — a dica das abas desabilitadas, visível (item desabilitado não recebe hover). */}
      {plataforma === "google" && (
        <p className="text-[11px] text-muted-foreground">{DICA_DO_GOOGLE_SO_CAMPANHA}: Por Público e Por Criativo ficam desabilitadas.</p>
      )}

      {/* Sem este aviso o total encolhe ao trocar de aba, e isso se lê como
          queda de investimento em vez de recorte da tela. */}
      {temGoogle && plataforma === "todas" && dimensao !== "campaign" && (
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
                {mostraPreview && <th className="text-left py-2 pr-2 select-none w-12">Prévia</th>}
                <th
                  className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  Dimensão{seta("name")}
                </th>
                <th className={th} onClick={() => toggleSort("spend")} title="Meta já com o imposto de 12,15%; Google sem imposto (o imposto é da Meta), somado do gasto diário na régua de SP">
                  Investimento{seta("spend")}
                </th>
                <th className={th} onClick={() => toggleSort("impressions")} title="Google: somadas do diário na régua de SP">
                  Impressões{seta("impressions")}
                </th>
                <th className={th} onClick={() => toggleSort("clicks")} title="Meta: cliques no link — “—” quando a Meta não devolveu link_click. Google: cliques da campanha, somados do diário na régua de SP">
                  Cliques{seta("clicks")}
                </th>
                <th className={th} onClick={() => toggleSort("ctr")} title="Meta: cliques no link ÷ impressões × 100 — “—” sem link_click. Google: cliques ÷ impressões × 100, recalculado da soma diária na régua de SP (pode não bater ao centavo com o painel do Google)">
                  CTR (link){seta("ctr")}
                </th>
                <th className={th} onClick={() => toggleSort("cpc")} title="Meta: investimento ÷ cliques no link — “—” sem link_click. Google: investimento ÷ cliques, recalculado da soma diária na régua de SP (pode não bater ao centavo com o painel do Google)">
                  CPC (link){seta("cpc")}
                </th>
                <th className={th} onClick={() => toggleSort("cpm")} title="Investimento ÷ Impressões × 1000. Google: recalculado da soma diária na régua de SP (pode não bater ao centavo com o painel do Google)">
                  CPM{seta("cpm")}
                </th>
                {mostraVendas && (
                  <>
                    <th className="text-right px-2 select-none" title="Vendas pagas (RevenueCat) de usuários vindos desta linha — Meta pelos ids/nomes que o app manda; Google: “—”, o Google não manda campanha">
                      Vendas
                    </th>
                    <th className="text-right px-2 select-none" title="Receita dessas vendas, convertida pelo câmbio">
                      Receita
                    </th>
                  </>
                )}
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
                    {mostraPreview && (
                      <td className="py-2 pr-2">
                        {r.platform === "meta" ? (
                          <CreativeThumb
                            projectId={projectId}
                            adId={r.id}
                            nome={r.name}
                            videoId={videoPorAd.get(r.id) ?? null}
                          />
                        ) : (
                          <div className="h-10 w-10" />
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 max-w-[280px] truncate" title={r.name}>
                      {r.name}
                    </td>
                    <td className="text-right px-2 font-medium">{fmtBRL(r.spend)}</td>
                    <td className="text-right px-2">{fmtNum(r.impressions)}</td>
                    <td className="text-right px-2">{fmtNum(r.clicks)}</td>
                    <td className="text-right px-2">{fmtPct(r.ctr)}</td>
                    <td className="text-right px-2">{fmtBRL(r.cpc)}</td>
                    <td className="text-right px-2">{fmtBRL(r.cpm)}</td>
                    {mostraVendas && (
                      <>
                        <td className="text-right px-2">{fmtNum(vendasDaLinha(r)?.vendas ?? null)}</td>
                        <td className="text-right px-2">{fmtBRL(receitaBrl(vendasDaLinha(r)))}</td>
                      </>
                    )}
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
                {/* Story 42.12 (AC5): o que não cabe numa linha aparece, para o total da Meta fechar. */}
                {/* Story 42.13 (AC3): o rótulo acompanha a dimensão. */}
                {mostraVendas && vendas && ([
                  [naoIdentificado.rotulo, rodape.naoIdentificado, naoIdentificado.dica],
                  ["Sem linha nesta tabela", rodape.semLinha, "Vendas da Meta de campanha/conjunto/anúncio que não está nesta tabela (sem campanha vinculada, sem investimento no período ou nome trocado)"],
                ] as const).map(([rotulo, c, dica]) =>
                  c ? (
                    <tr key={rotulo} className="border-t border-border/20 text-muted-foreground">
                      {/* Vendas/Receita ficam DEPOIS do CPM e ANTES de Hook/Hold (Por Criativo). */}
                      <td className="py-2 pr-3" colSpan={colunas - 1 - (mostraVideo ? 2 : 0)} title={dica}>
                        Meta · {rotulo}
                      </td>
                      <td className="text-right px-2">{fmtNum(c.vendas)}</td>
                      <td className="text-right px-2">{fmtBRL(receitaBrl(c))}</td>
                      {mostraVideo && <td colSpan={2} />}
                    </tr>
                  ) : null,
                )}
                <tr className="border-t border-border/30 font-medium">
                  <td className="py-2 pr-3" colSpan={2}>
                    Total ({sorted.length} {sorted.length === 1 ? "linha" : "linhas"})
                  </td>
                  <td className="text-right px-2">{fmtBRL(total)}</td>
                  {mostraVendas ? (
                    <>
                      <td colSpan={colunas - 4 - (mostraVideo ? 2 : 0)} />
                      <td className="text-right px-2">{fmtNum(rodape.totalDeVendas ? rodape.totalDeVendas.vendas : null)}</td>
                      <td className="text-right px-2">{fmtBRL(rodape.totalDeVendas ? receitaBrl(rodape.totalDeVendas) : null)}</td>
                      {mostraVideo && <td colSpan={2} />}
                    </>
                  ) : (
                    <td colSpan={colunas - 2} />
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Story 42.13 (AC1c + QA loop): o Google em erro ou sem conta some da
          tabela — e o motivo aparece. */}
      {avisoGoogle && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          As linhas do Google Ads não aparecem. {avisoGoogle}
        </p>
      )}
      {/* A ausência é declarada, não silenciosa: sem esta nota a primeira
          pergunta de quem abre a tela é "cadê o ROAS". */}
      {estadoVendas.tipo === "erro" && mostraVendas && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as vendas por anúncio: {estadoVendas.mensagem}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {mostraVendas && estadoVendas.tipo === "pronto" && plataforma === "google"
          ? "Com o filtro Google, as vendas da Meta não aparecem; o Google não manda campanha, então Vendas e Receita das linhas ficam “—”."
          : mostraVendas && estadoVendas.tipo === "pronto"
          ? `Vendas e Receita da Meta vêm do RevenueCat, pelo anúncio que o app registra no usuário; o total soma as linhas, “${naoIdentificado.rotulo}” e “Sem linha nesta tabela”. ${declaracaoDeCobertura(estadoVendas.dados)} ROAS e CAC por linha não fazem parte desta tabela.`
          : "Faturamento, ROAS e CAC por linha dependem de atribuir cada venda do RevenueCat a um anúncio — ver Story 42.6."}
      </p>
    </div>
  );
}
