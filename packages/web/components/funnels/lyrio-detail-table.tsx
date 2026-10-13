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
//     Perpétuo não tem: as linhas do Google trazem CTR/CPC prontos da API do
//     Google, que não são cliques em link — daí o tooltip separar as duas
//     origens em vez de prometer "link" para a tabela inteira.
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
import { useGoogleAdsCampaigns, type GoogleAdsCampaign } from "@/lib/hooks/use-google-ads-analytics";
import { CreativeThumb } from "@/components/traffic/creative-thumb";
import { useRevenuecatVendasPorCanal } from "@/lib/hooks/use-revenuecat";
import {
  declaracaoDeCobertura,
  estadoDasVendasPorCanal,
  rotuloDoNaoIdentificado,
  vendasDoDetalhamento,
  type ContagemDeVendas,
} from "@/lib/utils/vendas-por-canal-lyrio";
import { avisoDoGoogleEmLinha, estadoDoGoogleNaJanela, type ContaDoGoogle } from "@/lib/utils/lyrio-google-ads";
import {
  buildCampaignRows, metaRow, sortRows, totalSpend,
  type LyrioDetailRow, type LyrioSortKey, type MetaEntityInput,
} from "@/lib/utils/lyrio-detail-rows";

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
  /** Story 42.13 (QA loop): o estado da conta Google, decidido no pai — sem conta é aviso, não linha a menos calada. */
  contaGoogle: ContaDoGoogle;
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
  contaGoogle,
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
  const { data: googleData, isLoading: loadingGoogle, error: erroGoogle } = useGoogleAdsCampaigns(
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
  const avisoGoogle =
    dimensao === "campaign"
      ? avisoDoGoogleEmLinha(
          estadoDoGoogleNaJanela(contaGoogle, { isLoading: loadingGoogle, error: erroGoogle, data: googleData }, googleCampaignIds),
        )
      : null;
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
        <Select value={dimensao} onValueChange={(v) => setDimensao(v as Dimensao)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Por Campanha</SelectItem>
            <SelectItem value="adset">Por Público</SelectItem>
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
                {mostraPreview && <th className="text-left py-2 pr-2 select-none w-12">Prévia</th>}
                <th
                  className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  Dimensão{seta("name")}
                </th>
                <th className={th} onClick={() => toggleSort("spend")} title="Meta já com o imposto de 12,15%; Google sem imposto (o imposto é da Meta)">
                  Investimento{seta("spend")}
                </th>
                <th className={th} onClick={() => toggleSort("impressions")}>
                  Impressões{seta("impressions")}
                </th>
                <th className={th} onClick={() => toggleSort("clicks")} title="Meta: cliques no link — “—” quando a Meta não devolveu link_click. Google: cliques da campanha">
                  Cliques{seta("clicks")}
                </th>
                <th className={th} onClick={() => toggleSort("ctr")} title="Meta: cliques no link ÷ impressões × 100 — “—” sem link_click. Google: CTR como a API do Google entrega">
                  CTR (link){seta("ctr")}
                </th>
                <th className={th} onClick={() => toggleSort("cpc")} title="Meta: investimento ÷ cliques no link — “—” sem link_click. Google: CPC como a API do Google entrega">
                  CPC (link){seta("cpc")}
                </th>
                <th className={th} onClick={() => toggleSort("cpm")} title="Investimento ÷ Impressões × 1000">
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
                  [naoIdentificado.rotulo, vendas.naoIdentificado, naoIdentificado.dica],
                  ["Sem linha nesta tabela", vendas.semLinha, "Vendas da Meta de campanha/conjunto/anúncio que não está nesta tabela (sem campanha vinculada, sem investimento no período ou nome trocado)"],
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
                      <td className="text-right px-2">{fmtNum(vendas ? vendas.totalMeta.vendas : null)}</td>
                      <td className="text-right px-2">{fmtBRL(vendas ? receitaBrl(vendas.totalMeta) : null)}</td>
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
        {mostraVendas && estadoVendas.tipo === "pronto"
          ? `Vendas e Receita da Meta vêm do RevenueCat, pelo anúncio que o app registra no usuário; o total soma as linhas, “${naoIdentificado.rotulo}” e “Sem linha nesta tabela”. ${declaracaoDeCobertura(estadoVendas.dados)} ROAS e CAC por linha não fazem parte desta tabela.`
          : "Faturamento, ROAS e CAC por linha dependem de atribuir cada venda do RevenueCat a um anúncio — ver Story 42.6."}
      </p>
    </div>
  );
}
