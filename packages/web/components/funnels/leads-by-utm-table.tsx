"use client";

/**
 * Leads captados por UTM (Story: visão de leads da planilha conectada).
 *
 * Lê as linhas da planilha de leads já vinculada ao funil/etapa
 * (useFunnelSpreadsheets → type "leads") e agrupa os leads por dimensão de UTM
 * (source / medium / campaign / content / term — ou a combinação das cinco).
 * Cada grupo mostra a contagem de leads (dedup por e-mail) e pode ser expandido
 * pra listar quem são os leads daquele grupo (nome, e-mail, data + UTMs).
 *
 * Respeita a janela de dias do dashboard (filterSheetRowsByDays) e mostra a
 * planilha inteira do funil (sem filtro por campanha) — é um explorador do que
 * está de fato na planilha conectada.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, ListFilter, Search, Users } from "lucide-react";
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

interface LeadItem {
  name: string;
  email: string;
  date: string;
  utms: Record<UtmKey, string>;
}
interface Group {
  key: string;
  cells: string[]; // valores das dimensões visíveis
  leads: LeadItem[];
}

const EMPTY = "—";
const clean = (v: string | undefined) => (v ?? "").trim();

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

  const { data: sheets } = useFunnelSpreadsheets(projectId, funnelId, stageId ?? null);
  const leadsSheet =
    sheets?.spreadsheets.find((s) => s.type === "leads") ?? sheets?.spreadsheets[0];
  const { data: sheetData, isLoading } = useFunnelSpreadsheetData(
    projectId,
    funnelId,
    leadsSheet?.id,
  );

  const visibleDims: UtmKey[] = groupBy === "combo" ? UTM_KEYS : [groupBy];

  const { groups, totalLeads } = useMemo(() => {
    if (!sheetData) return { groups: [] as Group[], totalLeads: 0 };
    const rows = filterSheetRowsByDays(sheetData, days);
    const map = new Map<string, Group & { seen: Set<string> }>();
    const seenGlobal = new Set<string>();

    rows.forEach((r, idx) => {
      const utms: Record<UtmKey, string> = {
        utm_source: clean(r.named.utm_source),
        utm_medium: clean(r.named.utm_medium),
        utm_campaign: clean(r.named.utm_campaign),
        utm_content: clean(r.named.utm_content),
        utm_term: clean(r.named.utm_term),
      };
      const email = clean(r.named.email);
      const dedupKey = email ? normalizeEmail(email) : `__noemail_${idx}`;

      const key = visibleDims.map((d) => utms[d] || "(sem)").join(" › ");
      let g = map.get(key);
      if (!g) {
        g = { key, cells: visibleDims.map((d) => utms[d] || EMPTY), leads: [], seen: new Set() };
        map.set(key, g);
      }
      // dedup por e-mail dentro do grupo — 1 pessoa = 1 lead
      if (!g.seen.has(dedupKey)) {
        g.seen.add(dedupKey);
        g.leads.push({ name: clean(r.named.name), email, date: clean(r.named.date), utms });
      }
      seenGlobal.add(dedupKey);
    });

    let arr = [...map.values()].sort((a, b) => b.leads.length - a.leads.length);
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (g) =>
          g.cells.join(" ").toLowerCase().includes(q) ||
          g.leads.some((l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)),
      );
    }
    return { groups: arr, totalLeads: seenGlobal.size };
  }, [sheetData, days, groupBy, query, visibleDims]);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Leads captados por UTM</h3>
          <span className="text-[11px] text-muted-foreground">
            {totalLeads.toLocaleString("pt-BR")} leads · {groups.length} grupos
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            onClick={() => {
              setGroupBy(d.key);
              setExpanded(null);
            }}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={visibleDims.length + 2}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleDims.length + 2} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lead na planilha conectada para o período.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => {
                const open = expanded === g.key;
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
                      <TableCell className="py-2 text-right font-semibold tabular-nums">
                        {g.leads.length.toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={visibleDims.length + 2} className="p-0">
                          <div className="max-h-80 overflow-y-auto px-4 py-3">
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
    </div>
  );
}
