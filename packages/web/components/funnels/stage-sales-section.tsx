"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { StageCreativePerformanceTable } from "./stage-creative-performance-table";
import { SellersBreakdownGrid } from "./sellers-breakdown-grid";
import { Skeleton } from "@/components/ui/skeleton";
import type { StageSalesSubtype } from "@loyola-x/shared";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Story 28.7 hotfix: detecta Meta ID numérico (15+ dígitos) vs UTM textual
 * literal (`social`, `org`, `link_in_bio`, etc). Só Meta IDs reais devem
 * mostrar badge "não resolvido" quando o backend falha — textual é UTM
 * válida configurada manualmente, não é erro.
 */
function isMetaNumericId(value: string): boolean {
  return /^\d{15,}$/.test(value.trim());
}

/**
 * Story 28.7 hotfix (19/05): filtra UTMs com valor inválido/ausente que
 * passariam pelo `!== "Não informado"` (strings vazias, literais "null",
 * "undefined", whitespace). Casa com `sanitizeUtmValue` no backend pra
 * cobrir caches antigos antes do redeploy.
 */
function isValidUtmKey(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (trimmed === "Não informado") return false;
  const lower = trimmed.toLowerCase();
  return lower !== "null" && lower !== "undefined" && lower !== "-" && lower !== "n/a" && lower !== "na";
}

const TABLE_DEFAULT_TOP_N = 10;

interface SalesCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  tooltip?: string;
}

function SalesCard({ label, value, highlight, tooltip }: SalesCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-1 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}
      title={tooltip}
    >
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="text-[9px] text-muted-foreground/60 cursor-help" title={tooltip}>(i)</span>
        )}
      </p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""} whitespace-pre-wrap`}>{value}</p>
    </div>
  );
}

interface SalesTableProps {
  rows: { key: string; label: string; vendas: number; bruto: number; unresolved?: boolean }[];
  emptyMessage: string;
  keyLabel: string;
  /** Story 28.7 hotfix: limita render a Top N rows com botão "ver todos" pra tabelas longas. */
  topN?: number;
}

function SalesTable({ rows, emptyMessage, keyLabel, topN = TABLE_DEFAULT_TOP_N }: SalesTableProps) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);
  const showCollapse = rows.length > topN;
  const visibleRows = showCollapse && !expanded ? rows.slice(0, topN) : rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/30">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">{keyLabel}</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Vendas</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Bruto</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.key} className="border-t border-border/10">
              <td className="py-2 px-3 font-medium">
                <span
                  className={row.unresolved ? "font-mono text-muted-foreground" : "break-all"}
                >
                  {row.label}
                </span>
                {row.unresolved && (
                  <span
                    className="ml-2 text-[10px] text-amber-500 whitespace-nowrap"
                    title="Meta ID não resolvido — ad/adset pode ter sido deletado ou estar em outra conta"
                  >
                    ⚠️ id sem nome
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">
                {row.vendas}
                <span className="text-[10px] ml-1">
                  ({totalVendas > 0 ? ((row.vendas / totalVendas) * 100).toFixed(0) : 0}%)
                </span>
              </td>
              <td className="py-2 px-3 text-right whitespace-nowrap">{formatCurrency(row.bruto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 border-t border-border/10 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Ver todos ({rows.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface StageSalesSectionProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  subtype: StageSalesSubtype;
  title: string;
  days?: number;
  /**
   * Map de adset_id → adset_name vindo da Meta API. Quando informado, a tabela
   * "Por Medium (Adset)" resolve `utm_medium` (que armazena o adset_id) pro
   * nome humano e re-agrupa pelos mesmos nomes de adset.
   */
  adsetsMap?: Map<string, string>;
}

export function StageSalesSection({
  projectId,
  funnelId,
  stageId,
  subtype,
  title,
  days,
  adsetsMap,
}: StageSalesSectionProps) {
  const { data, isLoading, isError } = useStageSalesData(
    projectId,
    funnelId,
    stageId,
    subtype,
    days
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold">{title}</p>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (isError || !data || data.semDados) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">
          {data?.semDados
            ? "Nenhuma planilha de vendas conectada para esta seção."
            : "Erro ao carregar dados de vendas."}
        </p>
      </div>
    );
  }

  const canalRows = data.porCanal.map((c) => ({
    key: c.canal,
    label: c.canal,
    vendas: c.vendas,
    bruto: c.bruto,
  }));

  // Story 28.7: backend resolve adset_name via cache persistente. `adsetsMap`
  // fica como fallback. Badge "id sem nome" SÓ aparece pra Meta IDs numéricos
  // que falharam — UTMs textuais (`social`, `org`, `captacao`) são válidas e
  // não devem ser marcadas como erro.
  const mediumRows = (data.porUtmMedium ?? [])
    .filter((m) => isValidUtmKey(m.medium))
    .map((m) => {
      const backendResolved = !!m.name && m.name !== m.medium;
      const fallback = !backendResolved ? adsetsMap?.get(m.medium) : undefined;
      const finalLabel = (backendResolved ? m.name : fallback || m.medium) || "(sem identificação)";
      const unresolved = !backendResolved && !fallback && isMetaNumericId(m.medium);
      return {
        key: m.medium,
        label: finalLabel,
        unresolved,
        vendas: m.vendas,
        bruto: m.bruto,
      };
    });

  const formaRows = data.porFormaPagamento.map((f) => ({
    key: f.forma,
    label: f.forma,
    vendas: f.vendas,
    bruto: f.bruto,
  }));

  // Story 18.32: porUtmTerm removido (replaced by refactored Medium/Content matching)
  // TODO AC2: Implement Medium (Adset) matching with grouping by adset_name
  // TODO AC3: Implement Content (Ad) matching with grouping by ad_name
  const contentRows = (data.porUtmContent ?? [])
    .filter((c) => isValidUtmKey(c.content))
    .map((c) => ({
      key: c.content,
      label: c.name || c.content || "(sem identificação)",
      unresolved: c.name === c.content && isMetaNumericId(c.content),
      vendas: c.vendas,
      bruto: c.bruto,
    }));

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{title}</p>

      {/* Cards — Story 19.9 ext: tooltip mostra breakdown planilha vs manual */}
      {(() => {
        const br = data.breakdown;
        const tooltipVendas = br
          ? `Planilha: ${br.spreadsheet.vendas}\nManuais: ${br.manual.vendas}`
          : undefined;
        const tooltipBruto = br
          ? `Planilha: ${formatCurrency(br.spreadsheet.bruto)} (${br.spreadsheet.vendas})\nManuais: ${formatCurrency(br.manual.bruto)} (${br.manual.vendas})`
          : undefined;
        return (
          <div className="grid grid-cols-2 gap-3">
            <SalesCard
              label="Total de Vendas"
              value={data.totalVendas}
              highlight
              tooltip={tooltipVendas}
            />
            <SalesCard
              label="Faturamento Bruto"
              value={formatCurrency(data.faturamentoBruto)}
              tooltip={tooltipBruto}
            />
          </div>
        );
      })()}

      {/* Canal de Origem */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Canal de Origem</p>
        <SalesTable rows={canalRows} emptyMessage="Sem dados por canal." keyLabel="Canal" />
      </div>

      {/* Por Medium (utm_medium → adset_name via Meta API) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Medium (Adset)</p>
        <SalesTable rows={mediumRows} emptyMessage="Sem dados de medium (mapeie a coluna utm_medium na planilha)." keyLabel="Adset" />
      </div>

      {/* Story 18.32: Por Content (utm_content → ad_name via Meta API grouping) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Content (Ad)</p>
        <SalesTable
          rows={contentRows}
          emptyMessage="Sem dados de content (mapeie a coluna utm_content na planilha)."
          keyLabel="Anúncio"
        />
      </div>

      {/* Story 18.24: Tabela de Desempenho de Criativos */}
      {subtype === "capture" && (
        <div className="space-y-2 border-t pt-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground">Desempenho de Criativos (Meta Ads)</p>
          <StageCreativePerformanceTable
            funnelId={funnelId}
            stageId={stageId}
            days={days}
          />
        </div>
      )}

      {/* Forma de Pagamento */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Forma de Pagamento</p>
        <SalesTable rows={formaRows} emptyMessage="Sem dados por forma de pagamento." keyLabel="Forma" />
      </div>

      {/* Story 19.8: Vendedores × Perfil — só pro Produto Principal.
          Lead scoring vive na etapa Captação Paga; backend busca o scoring/
          survey em qualquer stage do mesmo funnel pra atribuir perfil aos
          compradores do principal via email. */}
      {subtype === "main_product" && (
        <div className="space-y-2 border-t pt-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Vendedores × Perfil do Lead
          </p>
          <SellersBreakdownGrid
            projectId={projectId}
            funnelId={funnelId}
            stageId={stageId}
            subtype={subtype}
          />
        </div>
      )}
    </div>
  );
}
