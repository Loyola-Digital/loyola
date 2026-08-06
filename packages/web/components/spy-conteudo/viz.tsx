"use client";

/**
 * Spy de Conteúdo — primitivas de gráfico.
 *
 * Regras que valem em todo gráfico daqui (método de dataviz):
 * - Marcas finas, grid em hairline sólido e recessivo, nunca tracejado.
 * - Uma série = UMA cor. Colorir barra por tamanho seria codificar o valor duas
 *   vezes e queimar o único canal livre.
 * - Rampa ordinal só em categoria ORDENADA (faixas de tamanho), nunca nominal.
 * - Texto usa token de texto, nunca a cor da série — a identidade vem da marca
 *   colorida ao lado, não de tingir a palavra.
 * - Todo gráfico tem tabela equivalente: o tooltip enriquece, nunca é o único
 *   caminho pro número (e é o que cobre a cor de contraste mais baixo).
 */

import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";

export const VIZ_SERIES_1 = "var(--viz-series-1)";
export const VIZ_ORDINAL = [
  "var(--viz-ord-1)",
  "var(--viz-ord-2)",
  "var(--viz-ord-3)",
  "var(--viz-ord-4)",
];
export const VIZ_CATEGORICAL = [
  "var(--viz-series-1)",
  "var(--viz-series-2)",
  "var(--viz-series-3)",
];

export const nf = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("pt-BR");

/**
 * Compacta números grandes no eixo (12.9K) sem perder legibilidade.
 * Aceita null/undefined porque também formata valor vindo de API — sem a
 * guarda, um campo ausente virava a string "undefined" no meio do dashboard.
 */
export const nfCompact = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
};

/** Eixos e grid: hairline sólido, um passo fora da superfície. Recessivos. */
export const axisProps = {
  tick: { fontSize: 11, fill: "var(--color-muted-foreground)" },
  tickLine: false,
  axisLine: { stroke: "var(--viz-axis)" },
} as const;

export const gridProps = {
  stroke: "var(--viz-grid)",
  strokeDasharray: "0", // sólido — tracejado lê como "projeção", não como grid
  vertical: false,
} as const;

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * Tooltip: o VALOR lidera (é o que a pessoa quer), o rótulo é secundário.
 * A série é marcada por um traço curto da cor — no tooltip, um quadrado cheio é
 * tinta com peso de dado fazendo trabalho de rótulo.
 */
export function VizTooltip({
  active,
  title,
  rows,
}: {
  active?: boolean;
  title: string;
  rows: TooltipRow[];
}) {
  if (!active) return null;
  return (
    <div className="pointer-events-none min-w-[150px] rounded-lg border border-border/60 bg-popover px-2.5 py-2 shadow-lg">
      <p className="mb-1.5 border-b border-border/40 pb-1 text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {r.color && (
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ background: r.color }}
                />
              )}
              {r.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Card de gráfico com título, subtítulo e a tabela equivalente embutida.
 *
 * A tabela não é extra: é o que garante que nenhum valor dependa de passar o
 * mouse — e é o relevo exigido pela cor de contraste mais baixo da paleta.
 */
export function ChartCard({
  title,
  hint,
  table,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  table?: { head: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className={`spy-viz rounded-xl border border-border/40 bg-card p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {table && (
        <>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showTable}
          >
            <Table2 className="h-3 w-3" />
            Ver dados em tabela
            <ChevronDown className={`h-3 w-3 transition-transform ${showTable ? "rotate-180" : ""}`} />
          </button>
          {showTable && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {table.head.map((h, i) => (
                      <th
                        key={h}
                        className={`px-2 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border/30">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`px-2 py-1.5 ${j === 0 ? "" : "text-right tabular-nums"}`}
                        >
                          {typeof cell === "number" ? nf(cell) : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Stat tile. Valor em figuras proporcionais — `tabular-nums` num número grande
 * dá a todo dígito a largura do zero e faz "121" parecer frouxo.
 */
export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
