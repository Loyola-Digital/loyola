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
   * - Captação Paga: Total Ingressos, Ingressos Pg, Ingressos Org, Ingressos s/ track
   */
  stageType?: StageType;
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
  const warn = v < 70;
  return (
    <span className={warn ? "text-amber-600 font-medium" : ""}>
      {warn ? "⚠️ " : ""}
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
 * Tabela diária cruzada (Meta Ads + planilha de leads).
 *
 * Ordem das colunas: Dia, Investimento, Faturamento, Cliques, Impressões,
 * Total Leads, CPL Pg, CPL G, CPM, CPC, CTR, LP View, Connect Rate, Tx Conv.,
 * Leads pagos, Leads org, Leads s/ track. Última linha é o total via footer.
 *
 * Total Leads + CPL Pg/G ficam logo após Impressões para destacar a métrica
 * de custo de aquisição cedo na leitura.
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
  adsetsMap,
  projectId,
  funnelId,
  stageType,
}: CrossedFunnelDailyTableProps) {
  // Story 18.31: Condicionais por etapa (paid = Captação Paga, free = Captação Gratuita)
  const isPaidCapture = stageType === "paid";
  const labels = useMemo(() => ({
    totalLeads: isPaidCapture ? "Total Ingressos" : "Total Leads",
    leadsPg: isPaidCapture ? "Ingressos Pg" : "Leads Pg",
    leadsOrg: isPaidCapture ? "Ingressos Org" : "Leads Org",
    leadsSemTrack: isPaidCapture ? "Ingressos s/ track" : "Leads s/ track",
    // Story 18.34 AC1: Tooltip formatado com quebras de linha legíveis
    totalLeadsTooltip: isPaidCapture
      ? "Total Ingressos = Ingressos Pg + Ingressos Org + Ingressos s/ track\nIngressos Pg = Ingressos que vieram de mídia paga\nIngressos Org = Ingressos com origem orgânica"
      : "Total Leads = Leads Pg + Leads Org + Leads s/ track\nLeads Pg = Leads que vieram de mídia paga\nLeads Org = Leads com origem orgânica",
  }), [isPaidCapture]);
  const salesTotal = salesByDay
    ? Object.values(salesByDay).reduce((a, b) => a + b, 0)
    : null;

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
              <TableHead className="text-right min-w-[110px]">Investimento</TableHead>
              <TableHead className="text-right min-w-[110px]">Faturamento</TableHead>
              <TableHead className="text-right min-w-[80px]">Cliques</TableHead>
              <TableHead className="text-right min-w-[100px]">Impressões</TableHead>
              <TableHead
                className="text-right min-w-[100px] font-semibold cursor-help"
                title={labels.totalLeadsTooltip}
              >
                {labels.totalLeads}
              </TableHead>
              <TableHead className="text-right min-w-[90px]">CPL Pg</TableHead>
              <TableHead className="text-right min-w-[80px]">CPL Geral</TableHead>
              <TableHead className="text-right min-w-[80px]">CPM</TableHead>
              <TableHead className="text-right min-w-[80px]">CPC</TableHead>
              <TableHead className="text-right min-w-[70px]">CTR</TableHead>
              <TableHead className="text-right min-w-[80px]">LP View</TableHead>
              <TableHead className="text-right min-w-[110px]">Connect Rate</TableHead>
              <TableHead className="text-right min-w-[90px]" title="Leads Pagos ÷ Link Clicks × 100">Tx Conv.</TableHead>
              <TableHead className="text-right min-w-[100px]">{labels.leadsPg}</TableHead>
              <TableHead className="text-right min-w-[90px]">{labels.leadsOrg}</TableHead>
              <TableHead className="text-right min-w-[110px]">{labels.leadsSemTrack}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const totalLeads = r.leadsPagos + r.leadsOrg + r.leadsSemTrack;
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
                  <TableCell className="text-right">
                    {fmtCurrency(salesByDay ? (salesByDay[r.date] ?? 0) : r.faturamento)}
                  </TableCell>
                  <TableCell className="text-right">{fmtInt(r.linkClicks)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.impressions)}</TableCell>
                  <TableCell className="text-right">
                    {renderTotalLeadsCell(totalLeads, r.leadsByMedium, effectiveAdsetsMap)}
                  </TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cplPg)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cplG)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpm)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpc)}</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.ctr)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.lpView)}</TableCell>
                  <TableCell className="text-right">{renderConnectRate(r.connectRate)}</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.txConv)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsPagos)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsOrg)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsSemTrack)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.spend)}</TableCell>
              <TableCell className="text-right">
                {fmtCurrency(salesTotal !== null ? salesTotal : totals.faturamento)}
              </TableCell>
              <TableCell className="text-right">{fmtInt(totals.linkClicks)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.impressions)}</TableCell>
              <TableCell className="text-right">
                {renderTotalLeadsCell(
                  totals.leadsPagos + totals.leadsOrg + totals.leadsSemTrack,
                  totals.leadsByMedium,
                  effectiveAdsetsMap,
                )}
              </TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplPg)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplG)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpm)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpc)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.ctr)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.lpView)}</TableCell>
              <TableCell className="text-right">{renderConnectRate(totals.connectRate)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.txConv)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsPagos)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsOrg)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsSemTrack)}</TableCell>
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
              <span className="text-muted-foreground">Leads:</span>
              <span className="font-medium ml-2">
                {fmtInt(totals.leadsPagos)} Pagos | {fmtInt(totals.leadsOrg)} Org | {fmtInt(totals.leadsSemTrack)} Sem origem
              </span>
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
