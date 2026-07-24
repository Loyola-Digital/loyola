"use client";

/**
 * Leads (e vendas) captados por UTM — explorador da planilha conectada.
 *
 * Lê as linhas da planilha de leads (type "leads") E da planilha de vendas
 * (type "sales"|"custom") já vinculadas ao funil/etapa e agrupa por dimensão de
 * UTM (source / medium / campaign / content / term — ou a combinação das cinco).
 * Cada grupo mostra: leads (dedup por e-mail), vendas (linhas de venda na janela),
 * faturamento (soma do valor) e conversão (vendas ÷ leads). Expande pra listar
 * quem são os leads do grupo. Paginação de 5 grupos por página.
 *
 * Respeita a janela de dias do dashboard (filterSheetRowsByDays) e mostra as
 * planilhas inteiras do funil (sem filtro por campanha).
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListFilter, Search, Users } from "lucide-react";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import { normalizeEmail } from "@/lib/utils/normalize-answer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type UtmKey = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term";

const DIMENSIONS: { key: "combo" | UtmKey; label: string }[] = [
  { key: "combo", label: "Combinação" },
  { key: "utm_source", label: "Source" },
  { key: "utm_medium", label: "Medium" },
  { key: "utm_campaign", label: "Campaign" },
  { key: "utm_content", label: "Content" },
  { key: "utm_term", label: "Term" },
];

const UTM_KEYS: UtmKey[] = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const UTM_LABEL: Record<UtmKey, string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_content: "Content",
  utm_term: "Term",
};

const PAGE_SIZE = 5;
const EMPTY = "—";
const clean = (v: string | undefined) => (v ?? "").trim();

/** Parseia valor monetário PT-BR ("R$ 1.234,56" | "297,00" | "1234.56"). */
function parseValor(raw: string | undefined): number {
  const s = (raw ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let norm = s;
  if (hasDot && hasComma) norm = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) norm = s.replace(",", ".");
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : n;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface LeadItem {
  name: string;
  email: string;
  date: string;
  utms: Record<UtmKey, string>;
}
interface Group {
  key: string;
  cells: string[];
  leads: LeadItem[];
  seenLead: Set<string>;
  vendas: number;
  faturamento: number;
}

export function LeadsByUtmTable({
  projectId,
  funnelId,
  stageId,
  days,
}: {
  projectId: string;
  funnelId: string;
  stageId?: string;
  days: number;
}) {
  const [groupBy, setGroupBy] = useState<"combo" | UtmKey>("combo");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const { data: sheets } = useFunnelSpreadsheets(projectId, funnelId, stageId ?? null);
  const leadsSheet =
    sheets?.spreadsheets.find((s) => s.type === "leads") ?? sheets?.spreadsheets[0];
  const salesSheet = sheets?.spreadsheets.find((s) => s.type === "sales" || s.type === "custom");
  const { data: leadsData, isLoading: leadsLoading } = useFunnelSpreadsheetData(projectId, funnelId, leadsSheet?.id);
  const { data: salesData, isLoading: salesLoading } = useFunnelSpreadsheetData(projectId, funnelId, salesSheet?.id);
  const isLoading = leadsLoading || salesLoading;

  const visibleDims: UtmKey[] = groupBy === "combo" ? UTM_KEYS : [groupBy];

  const { groups, totalLeads, totalVendas, totalFat } = useMemo(() => {
    const map = new Map<string, Group>();
    const utmsOf = (r: { named: Partial<Record<string, string>> }): Record<UtmKey, string> => ({
      utm_source: clean(r.named.utm_source),
      utm_medium: clean(r.named.utm_medium),
      utm_campaign: clean(r.named.utm_campaign),
      utm_content: clean(r.named.utm_content),
      utm_term: clean(r.named.utm_term),
    });
    const getGroup = (utms: Record<UtmKey, string>): Group => {
      const key = visibleDims.map((d) => utms[d] || "(sem)").join(" › ");
      let g = map.get(key);
      if (!g) {
        g = { key, cells: visibleDims.map((d) => utms[d] || EMPTY), leads: [], seenLead: new Set(), vendas: 0, faturamento: 0 };
        map.set(key, g);
      }
      return g;
    };

    // Leads (dedup por e-mail)
    const seenGlobal = new Set<string>();
    if (leadsData) {
      filterSheetRowsByDays(leadsData, days).forEach((r, idx) => {
        const utms = utmsOf(r);
        const email = clean(r.named.email);
        const dedupKey = email ? normalizeEmail(email) : `__noemail_${idx}`;
        const g = getGroup(utms);
        if (!g.seenLead.has(dedupKey)) {
          g.seenLead.add(dedupKey);
          g.leads.push({ name: clean(r.named.name), email, date: clean(r.named.date), utms });
        }
        seenGlobal.add(dedupKey);
      });
    }

    // Vendas (1 linha = 1 venda) + faturamento
    let totalVendas = 0;
    let totalFat = 0;
    if (salesData) {
      filterSheetRowsByDays(salesData, days).forEach((r) => {
        const utms = utmsOf(r);
        const val = parseValor(r.named.value);
        const g = getGroup(utms);
        g.vendas += 1;
        g.faturamento += val;
        totalVendas += 1;
        totalFat += val;
      });
    }

    let arr = [...map.values()].sort((a, b) => b.leads.length - a.leads.length || b.vendas - a.vendas);
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (g) =>
          g.cells.join(" ").toLowerCase().includes(q) ||
          g.leads.some((l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)),
      );
    }
    return { groups: arr, totalLeads: seenGlobal.size, totalVendas, totalFat };
  }, [leadsData, salesData, days, groupBy, query, visibleDims]);

  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageGroups = groups.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const colSpan = visibleDims.length + 5;

  const resetTo = (fn: () => void) => {
    fn();
    setPage(0);
    setExpanded(null);
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Leads &amp; vendas por UTM</h3>
          <span className="text-[11px] text-muted-foreground">
            {totalLeads.toLocaleString("pt-BR")} leads · {totalVendas.toLocaleString("pt-BR")} vendas · {brl(totalFat)} · {groups.length} grupos
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => resetTo(() => setQuery(e.target.value))}
            placeholder="Buscar UTM, nome ou e-mail…"
            className="h-8 w-56 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Agrupar por */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="mr-1 text-[11px] text-muted-foreground">Agrupar por:</span>
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => resetTo(() => setGroupBy(d.key))}
            className={`h-6 rounded px-2.5 text-[11px] font-medium transition-colors ${
              groupBy === d.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              {visibleDims.map((d) => (
                <TableHead key={d} className="text-xs">{UTM_LABEL[d]}</TableHead>
              ))}
              <TableHead className="text-right text-xs">Leads</TableHead>
              <TableHead className="text-right text-xs">Vendas</TableHead>
              <TableHead className="text-right text-xs">Faturamento</TableHead>
              <TableHead className="text-right text-xs">Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colSpan}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : pageGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lead/venda na planilha conectada para o período.
                </TableCell>
              </TableRow>
            ) : (
              pageGroups.map((g) => {
                const open = expanded === g.key;
                const conv = g.leads.length > 0 ? (g.vendas / g.leads.length) * 100 : null;
                return (
                  <Fragment key={g.key}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : g.key)}
                    >
                      <TableCell className="py-2">
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                      </TableCell>
                      {g.cells.map((c, i) => (
                        <TableCell key={i} className="py-2 font-mono text-xs">{c}</TableCell>
                      ))}
                      <TableCell className="py-2 text-right font-semibold tabular-nums">{g.leads.length.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{g.vendas.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-emerald-500">{g.faturamento > 0 ? brl(g.faturamento) : EMPTY}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{conv != null ? `${conv.toFixed(1)}%` : EMPTY}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={colSpan} className="p-0">
                          <div className="max-h-80 overflow-y-auto px-4 py-3">
                            {g.leads.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Vendas sem lead correspondente na planilha de leads.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="pb-1.5 pr-3 font-medium">Nome</th>
                                    <th className="pb-1.5 pr-3 font-medium">E-mail</th>
                                    <th className="pb-1.5 pr-3 font-medium">Data</th>
                                    {groupBy !== "combo" &&
                                      UTM_KEYS.filter((k) => k !== groupBy).map((k) => (
                                        <th key={k} className="pb-1.5 pr-3 font-medium">{UTM_LABEL[k]}</th>
                                      ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.leads.map((l, i) => (
                                    <tr key={i} className="border-t border-border/20">
                                      <td className="py-1 pr-3">{l.name || EMPTY}</td>
                                      <td className="py-1 pr-3 text-muted-foreground">{l.email || EMPTY}</td>
                                      <td className="py-1 pr-3 tabular-nums text-muted-foreground">{l.date || EMPTY}</td>
                                      {groupBy !== "combo" &&
                                        UTM_KEYS.filter((k) => k !== groupBy).map((k) => (
                                          <td key={k} className="py-1 pr-3 font-mono text-muted-foreground">{l.utms[k] || EMPTY}</td>
                                        ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {!isLoading && groups.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>Página {safePage + 1} de {pageCount}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setPage(Math.max(0, safePage - 1)); setExpanded(null); }}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 transition-colors hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setPage(Math.min(pageCount - 1, safePage + 1)); setExpanded(null); }}
              disabled={safePage >= pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 transition-colors hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
