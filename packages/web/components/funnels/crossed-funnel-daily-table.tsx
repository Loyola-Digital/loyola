"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRow } from "@/lib/utils/funnel-metrics";
import type { StageType } from "@loyola-x/shared";
import { resolveMediumByAdsets, useResolveAdsetNames } from "@/lib/hooks/use-funnel-adsets-map";
import {
  useFunnelBatchTurns,
  useCreateFunnelBatchTurn,
  useUpdateFunnelBatchTurn,
  useDeleteFunnelBatchTurn,
  type FunnelBatchTurn,
} from "@/lib/hooks/use-funnel-batch-turns";

interface CrossedFunnelDailyTableProps {
  rows: DailyRow[];
  totals: DailyRow;
  title?: string;
  surveyTotal?: number | null;
  surveyMatched?: number | null;
  surveyUnmatched?: number | null;
  salesByDay?: Record<string, number>;
  /**
   * Story 18.48: vendas (ingressos) dedup por dia × origem. Na etapa Paga, as
   * colunas de ingresso (Total/Pg/Org/s-track) usam ISSO em vez dos leads.
   * O card "Leads Popup" (fora desta tabela) continua usando leads.
   */
  ingressosByDay?: Record<string, { pago: number; org: number; semTrack: number }>;
  /**
   * Map de adset_id → adset_name vindo da Meta API. Quando informado, o
   * tooltip de Total Leads resolve `utm_medium` (que armazena o adset_id)
   * pro nome humano e re-agrupa pelos mesmos nomes (vários IDs com
   * mesmo nome viram uma linha só).
   */
  adsetsMap?: Map<string, string>;
  /**
   * Quando `projectId` e `funnelId` forem informados, habilita a marcação
   * manual de "virada de lote" (subida de preço, fim de bônus etc) via
   * clique direito na linha. Marcações persistem no DB.
   */
  projectId?: string;
  funnelId?: string;
  /**
   * Stage type para renderizar labels condicionalmente:
   * - Captação Gratuita: Total Leads, Leads Pg, Leads Org, Leads s/ track
   * - Captação Paga: Ingressos únicos/totais, Ingressos Pg, Ingressos Org, Ingressos s/ track
   */
  stageType?: StageType;
  /**
   * Story 18.51b: recortes por dia × origem das métricas ÚNICAS (produto da
   * captação, dedup por e-mail) e TOTAIS (todos os produtos, sem dedup) da etapa
   * Paga. `ingressosTotaisByDay` espelha `ingressosByDay`. Presentes só quando há
   * planilha de vendas conectada — `undefined` = sem planilha (AC-BUG.1).
   */
  ingressosUnicosByDay?: Record<string, { pago: number; org: number; semTrack: number }>;
  ingressosTotaisByDay?: Record<string, { pago: number; org: number; semTrack: number }>;
  faturamentoUnicoByDay?: Record<string, number>;
  faturamentoTotalByDay?: Record<string, number>;
  /** Ingressos (vendas) por produto — todos os produtos. Tooltip de "Ingressos totais". */
  ingressosPorProduto?: { produto: string; count: number; bruto: number; isOrderBump: boolean }[];
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtPercent(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatDateLabel(d: string) {
  if (d === "Total") return d;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function renderConnectRate(v: number | null) {
  if (v == null) return "—";
  // Story 18.52 AC8: >70% verde, <=70% amarelo.
  const good = v > 70;
  return (
    <span className={good ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
      {good ? "" : "⚠️ "}
      {fmtPercent(v)}
    </span>
  );
}

function renderTotalLeadsCell(
  totalLeads: number,
  leadsByMedium: Record<string, number> | undefined,
  adsetsMap?: Map<string, string>,
) {
  const display = fmtInt(totalLeads);
  if (totalLeads === 0) {
    return <span className="font-medium">{display}</span>;
  }
  const resolved = adsetsMap && leadsByMedium
    ? resolveMediumByAdsets(leadsByMedium, adsetsMap)
    : (leadsByMedium ?? {});
  const entries = Object.entries(resolved).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <span className="font-medium">{display}</span>;
  }
  const pct = (n: number) => (totalLeads > 0 ? (n / totalLeads) * 100 : 0);
  const tooltipText =
    "Leads por adset:\n" +
    entries
      .map(([m, c]) => `  ${m}: ${fmtInt(c)} (${pct(c).toFixed(1)}%)`)
      .join("\n");
  return (
    <span
      className="font-medium cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
      title={tooltipText}
    >
      {display}
    </span>
  );
}

interface ContextMenuState {
  date: string;
  turn: FunnelBatchTurn | null;
  x: number;
  y: number;
}

/**
 * Tabela diária cruzada (Meta Ads + planilha de leads/vendas).
 *
 * Ordem das colunas (Story 18.51b):
 * - Gratuita (free): Dia, Investimento, Faturamento, Total Leads, CPL Pg, CPL
 *   Geral, Cliques, Impressões, CPM, CPC, CTR, LP View, Connect Rate, Tx Conv.,
 *   Leads Pg, Leads Org, Leads s/ track (17 colunas).
 * - Paga (paid): Dia, Investimento, Faturamento único, Faturamento Total,
 *   Ingressos únicos, Ingressos totais, CPL Pg, CPL Geral, Ticket médio (únicos),
 *   Ticket médio (total), Cliques, Impressões, CPM, CPC, CTR, LP View, Connect
 *   Rate, Tx Conv., Ingressos Pg, Ingressos Org, Ingressos s/ track (21 colunas).
 * Última linha é o total via footer (soma dos recortes por dia).
 *
 * A coluna de leads/ingressos + CPL Pg/Geral ficam cedo na leitura para destacar
 * a métrica de custo de aquisição.
 *
 * Quando `projectId` e `funnelId` forem informados, ativa marcação manual de
 * "virada de lote" via clique direito (Story 27.1).
 *
 * Usado no LaunchDashboard (Story 18.3). Dados vêm do hook
 * `useCrossedFunnelMetrics` (Story 18.2/18.3).
 */
export function CrossedFunnelDailyTable({
  rows,
  totals,
  title = "Dados diários",
  surveyTotal,
  surveyMatched,
  surveyUnmatched,
  salesByDay,
  ingressosUnicosByDay,
  ingressosTotaisByDay,
  faturamentoUnicoByDay,
  faturamentoTotalByDay,
  ingressosPorProduto,
  adsetsMap,
  projectId,
  funnelId,
  stageType,
}: CrossedFunnelDailyTableProps) {
  // Story 18.31: Condicionais por etapa (paid = Captação Paga, free = Captação Gratuita)
  const isPaidCapture = stageType === "paid";
  // Story 18.51b: sabe se há planilha de vendas conectada (undefined = sem
  // planilha → AC-BUG.1: exibe "—" em vez de leads sob rótulo "Ingressos").
  const hasSalesData = isPaidCapture && ingressosUnicosByDay !== undefined;

  // Breakdown por origem dos ingressos ÚNICOS (base das colunas Pg/Org/s-track na
  // Paga). "Ingressos únicos" = pago + org + semTrack.
  const getUnicoOrigem = (date: string) => {
    const v = ingressosUnicosByDay?.[date];
    return { pago: v?.pago ?? 0, org: v?.org ?? 0, semTrack: v?.semTrack ?? 0 };
  };
  const sumOrigem = (v?: { pago: number; org: number; semTrack: number }) =>
    v ? v.pago + v.org + v.semTrack : 0;
  const unicoDia = (date: string) => sumOrigem(ingressosUnicosByDay?.[date]);
  const totalDia = (date: string) => sumOrigem(ingressosTotaisByDay?.[date]);
  const fatUnicoDia = (date: string) => faturamentoUnicoByDay?.[date] ?? 0;
  const fatTotalDia = (date: string) => faturamentoTotalByDay?.[date] ?? 0;
  const ticket = (fat: number, qtd: number): number | null => (qtd > 0 ? fat / qtd : null);

  // Totais (footer) — soma dos recortes por dia, pra bater com as colunas.
  const sumAllOrigem = (rec?: Record<string, { pago: number; org: number; semTrack: number }>) =>
    rec ? Object.values(rec).reduce((a, v) => a + v.pago + v.org + v.semTrack, 0) : 0;
  const sumAllNum = (rec?: Record<string, number>) =>
    rec ? Object.values(rec).reduce((a, v) => a + v, 0) : 0;
  const totUnicos = sumAllOrigem(ingressosUnicosByDay);
  const totTotais = sumAllOrigem(ingressosTotaisByDay);
  const totFatUnico = sumAllNum(faturamentoUnicoByDay);
  const totFatTotal = sumAllNum(faturamentoTotalByDay);
  const totUnicosOrigem = ingressosUnicosByDay
    ? Object.values(ingressosUnicosByDay).reduce(
        (a, v) => ({ pago: a.pago + v.pago, org: a.org + v.org, semTrack: a.semTrack + v.semTrack }),
        { pago: 0, org: 0, semTrack: 0 },
      )
    : { pago: 0, org: 0, semTrack: 0 };

  // Story 18.51b AC1b.3: tooltip de "Ingressos totais" com nº por produto.
  const ingressosTotaisTooltip = useMemo(() => {
    if (!ingressosPorProduto || ingressosPorProduto.length === 0) {
      return "Ingresso+OrderBump = todas as vendas (produto da captação + order bumps), sem deduplicar e-mail.";
    }
    const linhas = ingressosPorProduto
      .map((p) => `  ${p.produto}${p.isOrderBump ? " (order bump)" : ""}: ${fmtInt(p.count)}`)
      .join("\n");
    return "Ingresso+OrderBump = todas as vendas (captação + order bumps), sem dedup.\nPor produto:\n" + linhas;
  }, [ingressosPorProduto]);

  const labels = useMemo(() => ({
    totalLeads: isPaidCapture ? "Ingressos únicos" : "Total Leads",
    leadsPg: isPaidCapture ? "Ingressos Pg" : "Leads Pg",
    leadsOrg: isPaidCapture ? "Ingressos Org" : "Leads Org",
    leadsSemTrack: isPaidCapture ? "Ingressos s/ track" : "Leads s/ track",
    // Story 18.34 AC1: Tooltip formatado com quebras de linha legíveis
    totalLeadsTooltip: isPaidCapture
      ? "Ingressos únicos = e-mails distintos que compraram o produto da captação (não order bump), deduplicados.\n= Ingressos Pg + Ingressos Org + Ingressos s/ track"
      : "Total Leads = Leads Pg + Leads Org + Leads s/ track\nLeads Pg = Leads que vieram de mídia paga\nLeads Org = Leads com origem orgânica",
    // Story 18.52 AC1: "Ingressos totais" → "Ingresso+OrderBump".
    ingressoTotal: "Ingresso+OrderBump",
    // Story 18.52 AC2/AC3: CPL por ingressos únicos na Paga.
    cplPg: isPaidCapture ? "CPL Pago Único" : "CPL Pg",
    cplG: isPaidCapture ? "CPL Geral Único" : "CPL Geral",
  }), [isPaidCapture]);
  const salesTotal = salesByDay
    ? Object.values(salesByDay).reduce((a, b) => a + b, 0)
    : null;

  // Story 18.51b AC1e: tooltips de cálculo por cabeçalho (reusados no header).
  const TT = {
    investimento: "Investimento = gasto de mídia (Meta Ads) no dia.",
    fatUnico: "Faturamento único = soma do valorBruto de 1 compra por e-mail (a mais recente) do produto da captação.",
    fatTotal: "Faturamento Total = soma do valorBruto de TODAS as vendas (produto da captação + order bumps), sem dedup.",
    faturamento: "Faturamento bruto das vendas no dia.",
    ingUnicos: "Ingressos únicos = e-mails distintos que compraram o produto da captação (dedup por e-mail).",
    tmUnico: "Ticket médio (únicos) = Faturamento único ÷ Ingressos únicos.",
    tmTotal: "Ticket médio (total) = Faturamento Total ÷ Ingressos totais.",
    cplPg: isPaidCapture
      ? "CPL Pago Único = Investimento ÷ Ingressos únicos pagos."
      : "CPL Pago = Investimento ÷ Leads pagos.",
    cplG: isPaidCapture
      ? "CPL Geral Único = Investimento ÷ Ingressos únicos totais (pago+org+sem track)."
      : "CPL Geral = Investimento ÷ Total de leads.",
    cliques: "Cliques no link do anúncio (Meta).",
    impressoes: "Impressões dos anúncios (Meta).",
    cpm: "CPM = custo por mil impressões.",
    cpc: "CPC = custo por clique no link.",
    ctr: "CTR = cliques ÷ impressões × 100.",
    lpview: "LP View = visualizações da landing page.",
    connect: "Connect Rate = LP Views ÷ cliques × 100 (quantos cliques chegaram na LP).",
    txconv: isPaidCapture
      ? "Taxa de conversão = Ingressos únicos pagos ÷ cliques × 100."
      : "Taxa de conversão = Leads pagos ÷ cliques × 100.",
  };

  // Story 18.26 Fase 1.5: resolve adset names dos ids que aparecem em
  // leadsByMedium das rows usando o cache DB (meta_entity_names_cache 24h).
  // Vai muito mais leve que o /all-adsets do useFunnelAdsetsMap (que pega
  // tambem insights). Faz merge com o adsetsMap da prop pra manter compat.
  const adsetIdsFromRows = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const byMedium = row.leadsByMedium;
      if (byMedium) {
        for (const id of Object.keys(byMedium)) {
          if (id && id.trim()) set.add(id);
        }
      }
    }
    return Array.from(set);
  }, [rows]);
  const { adsetsMap: resolvedAdsetsMap } = useResolveAdsetNames(
    projectId ?? "",
    projectId ? adsetIdsFromRows : [],
  );
  const effectiveAdsetsMap = useMemo(() => {
    // Prefere o resolvedAdsetsMap (cache DB) sobre o adsetsMap da prop
    // (pode estar vazio ou ainda carregando). Cai pro prop quando o
    // resolved nao tem o id (compat).
    if (resolvedAdsetsMap.size === 0) return adsetsMap;
    if (!adsetsMap || adsetsMap.size === 0) return resolvedAdsetsMap;
    const merged = new Map(adsetsMap);
    for (const [id, name] of resolvedAdsetsMap.entries()) merged.set(id, name);
    return merged;
  }, [resolvedAdsetsMap, adsetsMap]);

  const batchTurnsEnabled = !!projectId && !!funnelId;
  const turnsQuery = useFunnelBatchTurns(projectId ?? "", funnelId ?? "");
  const createTurn = useCreateFunnelBatchTurn(projectId ?? "", funnelId ?? "");
  const updateTurn = useUpdateFunnelBatchTurn(projectId ?? "", funnelId ?? "");
  const deleteTurn = useDeleteFunnelBatchTurn(projectId ?? "", funnelId ?? "");

  const turnsByDate = useMemo(() => {
    const map = new Map<string, FunnelBatchTurn>();
    if (batchTurnsEnabled && turnsQuery.data) {
      for (const t of turnsQuery.data) map.set(t.date, t);
    }
    return map;
  }, [batchTurnsEnabled, turnsQuery.data]);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menu]);

  function handleRowContextMenu(e: React.MouseEvent, date: string) {
    if (!batchTurnsEnabled) return;
    e.preventDefault();
    const turn = turnsByDate.get(date) ?? null;
    setMenu({ date, turn, x: e.clientX, y: e.clientY });
  }

  function handleMark(date: string) {
    setMenu(null);
    const label = window.prompt(
      `Virada de lote em ${formatDateLabel(date)}\nDigite um label (ex: "Lote 2 → 3", "Início bônus"):`,
      "",
    );
    if (label && label.trim()) {
      createTurn.mutate({ date, label: label.trim() });
    }
  }

  function handleEdit(turn: FunnelBatchTurn) {
    setMenu(null);
    const label = window.prompt(
      `Editar label da virada em ${formatDateLabel(turn.date)}:`,
      turn.label,
    );
    if (label && label.trim() && label.trim() !== turn.label) {
      updateTurn.mutate({ id: turn.id, label: label.trim() });
    }
  }

  function handleDelete(turn: FunnelBatchTurn) {
    setMenu(null);
    if (window.confirm(`Remover virada de lote em ${formatDateLabel(turn.date)}?`)) {
      deleteTurn.mutate(turn.id);
    }
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      <div className="space-y-3">
        <div className="rounded-md border overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[90px]">Dia</TableHead>
              <TableHead className="text-right min-w-[110px] cursor-help" title={TT.investimento}>Investimento</TableHead>
              {isPaidCapture ? (
                <>
                  <TableHead className="text-right min-w-[120px] cursor-help" title={TT.fatUnico}>Faturamento único</TableHead>
                  <TableHead className="text-right min-w-[120px] cursor-help" title={TT.fatTotal}>Faturamento Total</TableHead>
                </>
              ) : (
                <TableHead className="text-right min-w-[110px] cursor-help" title={TT.faturamento}>Faturamento</TableHead>
              )}
              <TableHead
                className="text-right min-w-[110px] font-semibold cursor-help"
                title={labels.totalLeadsTooltip}
              >
                {labels.totalLeads}
              </TableHead>
              {isPaidCapture && (
                <TableHead className="text-right min-w-[130px] font-semibold cursor-help" title={ingressosTotaisTooltip}>
                  {labels.ingressoTotal}
                </TableHead>
              )}
              <TableHead className="text-right min-w-[110px] cursor-help" title={TT.cplPg}>{labels.cplPg}</TableHead>
              <TableHead className="text-right min-w-[110px] cursor-help" title={TT.cplG}>{labels.cplG}</TableHead>
              {isPaidCapture && (
                <>
                  <TableHead className="text-right min-w-[120px] cursor-help" title={TT.tmUnico}>Ticket médio (únicos)</TableHead>
                  <TableHead className="text-right min-w-[120px] cursor-help" title={TT.tmTotal}>Ticket médio (total)</TableHead>
                </>
              )}
              {/* Story 18.52 AC5: Tx Conv. movida para a esquerda de Cliques. */}
              <TableHead className="text-right min-w-[90px] cursor-help" title={TT.txconv}>Tx Conv.</TableHead>
              <TableHead className="text-right min-w-[80px] cursor-help" title={TT.cliques}>Cliques</TableHead>
              <TableHead className="text-right min-w-[100px] cursor-help" title={TT.impressoes}>Impressões</TableHead>
              <TableHead className="text-right min-w-[80px] cursor-help" title={TT.cpm}>CPM</TableHead>
              <TableHead className="text-right min-w-[80px] cursor-help" title={TT.cpc}>CPC</TableHead>
              <TableHead className="text-right min-w-[70px] cursor-help" title={TT.ctr}>CTR</TableHead>
              <TableHead className="text-right min-w-[80px] cursor-help" title={TT.lpview}>LP View</TableHead>
              <TableHead className="text-right min-w-[110px] cursor-help" title={TT.connect}>Connect Rate</TableHead>
              <TableHead className="text-right min-w-[100px] cursor-help" title={labels.totalLeadsTooltip}>{labels.leadsPg}</TableHead>
              <TableHead className="text-right min-w-[90px] cursor-help" title={labels.totalLeadsTooltip}>{labels.leadsOrg}</TableHead>
              <TableHead className="text-right min-w-[110px] cursor-help" title={labels.totalLeadsTooltip}>{labels.leadsSemTrack}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              // Story 18.51b: na Paga, o breakdown Pg/Org/s-track vem dos ingressos
              // ÚNICOS (dedup por e-mail). Sem planilha de vendas (hasSalesData
              // false) → null → células "—" (AC-BUG.1: não mostra leads sob rótulo
              // "Ingressos"). Free segue com leads.
              const ing = hasSalesData
                ? getUnicoOrigem(r.date)
                : isPaidCapture
                ? null
                : { pago: r.leadsPagos, org: r.leadsOrg, semTrack: r.leadsSemTrack };
              const totalLeads = ing ? ing.pago + ing.org + ing.semTrack : 0;
              const tmU = ticket(fatUnicoDia(r.date), unicoDia(r.date));
              const tmT = ticket(fatTotalDia(r.date), totalDia(r.date));
              const turn = turnsByDate.get(r.date);
              return (
                <TableRow
                  key={r.date}
                  onContextMenu={(e) => handleRowContextMenu(e, r.date)}
                  className={turn ? "border-l-4 border-l-amber-500/70" : undefined}
                >
                  <TableCell className="sticky left-0 bg-background z-10 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {turn && (
                        <span
                          className="cursor-help"
                          title={`Virada de lote: ${turn.label}`}
                          aria-label={`Virada de lote: ${turn.label}`}
                        >
                          📦
                        </span>
                      )}
                      {formatDateLabel(r.date)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.spend)}</TableCell>
                  {isPaidCapture ? (
                    <>
                      <TableCell className="text-right">{hasSalesData ? fmtCurrency(fatUnicoDia(r.date)) : "—"}</TableCell>
                      <TableCell className="text-right">{hasSalesData ? fmtCurrency(fatTotalDia(r.date)) : "—"}</TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right">
                      {fmtCurrency(salesByDay ? (salesByDay[r.date] ?? 0) : r.faturamento)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {isPaidCapture
                      ? hasSalesData ? fmtInt(unicoDia(r.date)) : "—"
                      : renderTotalLeadsCell(totalLeads, r.leadsByMedium, effectiveAdsetsMap)}
                  </TableCell>
                  {isPaidCapture && (
                    <TableCell className="text-right">{hasSalesData ? fmtInt(totalDia(r.date)) : "—"}</TableCell>
                  )}
                  <TableCell className="text-right">{fmtCurrency(r.cplPg)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cplG)}</TableCell>
                  {isPaidCapture && (
                    <>
                      <TableCell className="text-right">{tmU !== null ? fmtCurrency(tmU) : "—"}</TableCell>
                      <TableCell className="text-right">{tmT !== null ? fmtCurrency(tmT) : "—"}</TableCell>
                    </>
                  )}
                  {/* Story 18.52 AC5: Tx Conv. à esquerda de Cliques. */}
                  <TableCell className="text-right">{fmtPercent(r.txConv)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.linkClicks)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.impressions)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpm)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpc)}</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.ctr)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.lpView)}</TableCell>
                  <TableCell className="text-right">{renderConnectRate(r.connectRate)}</TableCell>
                  <TableCell className="text-right">{ing ? fmtInt(ing.pago) : "—"}</TableCell>
                  <TableCell className="text-right">{ing ? fmtInt(ing.org) : "—"}</TableCell>
                  <TableCell className="text-right">{ing ? fmtInt(ing.semTrack) : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.spend)}</TableCell>
              {isPaidCapture ? (
                <>
                  <TableCell className="text-right">{hasSalesData ? fmtCurrency(totFatUnico) : "—"}</TableCell>
                  <TableCell className="text-right">{hasSalesData ? fmtCurrency(totFatTotal) : "—"}</TableCell>
                </>
              ) : (
                <TableCell className="text-right">
                  {fmtCurrency(salesTotal !== null ? salesTotal : totals.faturamento)}
                </TableCell>
              )}
              <TableCell className="text-right">
                {isPaidCapture
                  ? hasSalesData ? fmtInt(totUnicos) : "—"
                  : renderTotalLeadsCell(
                      totals.leadsPagos + totals.leadsOrg + totals.leadsSemTrack,
                      totals.leadsByMedium,
                      effectiveAdsetsMap,
                    )}
              </TableCell>
              {isPaidCapture && (
                <TableCell className="text-right">{hasSalesData ? fmtInt(totTotais) : "—"}</TableCell>
              )}
              <TableCell className="text-right">{fmtCurrency(totals.cplPg)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplG)}</TableCell>
              {isPaidCapture && (() => {
                const tmU = ticket(totFatUnico, totUnicos);
                const tmT = ticket(totFatTotal, totTotais);
                return (
                  <>
                    <TableCell className="text-right">{tmU !== null ? fmtCurrency(tmU) : "—"}</TableCell>
                    <TableCell className="text-right">{tmT !== null ? fmtCurrency(tmT) : "—"}</TableCell>
                  </>
                );
              })()}
              {/* Story 18.52 AC5: Tx Conv. à esquerda de Cliques. */}
              <TableCell className="text-right">{fmtPercent(totals.txConv)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.linkClicks)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.impressions)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpm)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpc)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.ctr)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.lpView)}</TableCell>
              <TableCell className="text-right">{renderConnectRate(totals.connectRate)}</TableCell>
              <TableCell className="text-right">{isPaidCapture ? (hasSalesData ? fmtInt(totUnicosOrigem.pago) : "—") : fmtInt(totals.leadsPagos)}</TableCell>
              <TableCell className="text-right">{isPaidCapture ? (hasSalesData ? fmtInt(totUnicosOrigem.org) : "—") : fmtInt(totals.leadsOrg)}</TableCell>
              <TableCell className="text-right">{isPaidCapture ? (hasSalesData ? fmtInt(totUnicosOrigem.semTrack) : "—") : fmtInt(totals.leadsSemTrack)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        </div>

        {batchTurnsEnabled && (
          <p className="text-xs text-muted-foreground">
            Dica: clique direito numa linha de data pra marcar virada de lote.
          </p>
        )}

        <div className="rounded-md border border-border/30 bg-muted/20 px-4 py-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-muted-foreground">{isPaidCapture ? "Ingressos únicos:" : "Leads:"}</span>
              <span className="font-medium ml-2">
                {fmtInt(isPaidCapture ? totUnicosOrigem.pago : totals.leadsPagos)} Pagos | {fmtInt(isPaidCapture ? totUnicosOrigem.org : totals.leadsOrg)} Org | {fmtInt(isPaidCapture ? totUnicosOrigem.semTrack : totals.leadsSemTrack)} Sem origem
              </span>
              {isPaidCapture && hasSalesData && (
                <span className="text-muted-foreground ml-2">· Ingressos totais: <span className="font-medium text-foreground">{fmtInt(totTotais)}</span></span>
              )}
            </div>
            {surveyTotal != null && (
              <div>
                <span className="text-muted-foreground">Pesquisa:</span>
                <span className="font-medium ml-2">
                  {fmtInt(surveyTotal)} respostas | {fmtInt(surveyMatched)} com match | {fmtInt(surveyUnmatched)} sem match
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[200px] rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {menu.turn ? (
            <>
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50 mb-1">
                <div className="font-medium text-foreground">📦 {menu.turn.label}</div>
                <div className="text-[11px]">{formatDateLabel(menu.turn.date)}</div>
              </div>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleEdit(menu.turn!)}
              >
                ✏️ Editar label
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-destructive"
                onClick={() => handleDelete(menu.turn!)}
              >
                🗑️ Remover virada
              </button>
            </>
          ) : (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleMark(menu.date)}
            >
              📦 Marcar virada de lote
            </button>
          )}
        </div>
      )}
    </div>
  );
}
