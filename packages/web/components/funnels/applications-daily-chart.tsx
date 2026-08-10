"use client";

/**
 * Aplicações por dia — uma linha por forma (planilha de aplicação), nomeada pelo
 * label da planilha, alinhadas em D1/D2/D3.
 *
 * O time pode mapear mais de uma planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket"): cada uma vira uma série própria, com o
 * nome aparecendo na legenda e no tooltip. A comparação com o lançamento
 * anterior é casada forma a forma (mesmo nome) e desenhada tracejada, na mesma
 * cor da forma — cor identifica a forma, traço cheio/tracejado identifica o
 * lançamento.
 *
 * Alternar Diário/Acumulado existe porque as duas leituras respondem coisas
 * diferentes: o diário mostra o pico e o vale do dia a dia; o acumulado é o que
 * diz se o lançamento está à frente ou atrás na mesma altura.
 */

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, FileSpreadsheet } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useStageApplications,
  type ApplicationForm,
} from "@/lib/hooks/use-stage-applications";

// Paleta de séries do design system (.spy-viz). Categoria nominal: identidade
// nunca é só cor — legenda e tooltip sempre trazem o nome da forma. Além de 3
// formas as cores repetem, mas o rótulo continua distinguindo.
const PALETTE = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)"];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function fmtDate(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

type Campo = "aplicacoes" | "acumulado";

interface Row {
  dia: string;
  date: string | null;
  [serie: string]: number | string | null;
}

/** Chaves de dataKey por forma — estáveis pelo sheetId. */
const keyAtual = (f: ApplicationForm) => `a_${f.sheetId}`;
const keyAnterior = (f: ApplicationForm) => `b_${f.sheetId}`;

/**
 * Junta todas as formas (atual + anterior) num array de linhas indexado por
 * D-day. Todas as formas do lançamento compartilham o mesmo eixo (mesmo D1),
 * então a data de um D-day é a mesma pra todas — usamos a da primeira forma.
 */
function buildRows(forms: ApplicationForm[], campo: Campo): Row[] {
  let maxDia = 0;
  for (const f of forms) {
    maxDia = Math.max(maxDia, f.points.length, f.comparacao?.points.length ?? 0);
  }
  const rows: Row[] = [];
  for (let i = 1; i <= maxDia; i++) {
    const row: Row = { dia: `D${i}`, date: forms[0]?.points[i - 1]?.date ?? null };
    for (const f of forms) {
      const a = f.points[i - 1];
      const b = f.comparacao?.points[i - 1];
      row[keyAtual(f)] = a ? a[campo] : null;
      row[keyAnterior(f)] = b ? b[campo] : null;
    }
    rows.push(row);
  }
  return rows;
}

export function ApplicationsDailyChart({
  projectId,
  funnelId,
  stageId,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
}) {
  const { data, isLoading } = useStageApplications(projectId, funnelId, stageId);
  const [modo, setModo] = useState<"diario" | "acumulado">("acumulado");
  const [showTable, setShowTable] = useState(false);

  if (isLoading) return <Skeleton className="h-[340px] rounded-xl" />;
  if (!data) return null;

  // Sem planilha vinculada a seção não aparece — não é erro, é etapa que ainda
  // não tem comercial rodando.
  if (data.semPlanilha) {
    return (
      <div className="spy-viz rounded-xl border border-dashed border-border/40 bg-card p-6 text-center">
        <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Aplicações do comercial</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Vincule uma ou mais planilhas em <strong>Planilhas → Vincular</strong>, com o tipo{" "}
          <strong>Aplicação (comercial)</strong> e a coluna de data mapeada. Cada planilha vira uma
          linha do gráfico — dê um nome (label) a cada uma, ex.: <em>form com ticket</em> e{" "}
          <em>form sem ticket</em>.
        </p>
      </div>
    );
  }

  const forms = data.forms;
  const campo: Campo = modo === "diario" ? "aplicacoes" : "acumulado";
  const rows = buildRows(forms, campo);
  const temComparacao = forms.some((f) => f.comparacao && f.comparacao.points.length > 0);

  return (
    <div className="spy-viz rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Aplicações por dia</h3>
          <p className="text-[11px] text-muted-foreground">
            Uma linha por planilha de aplicação, alinhada por dia de lançamento (D1 = primeiro dia
            com aplicação)
            {temComparacao && data.compareFunnelName
              ? ` · tracejado = ${data.compareFunnelName}`
              : ""}
          </p>
        </div>

        <div className="inline-flex rounded-md border border-border/50 p-0.5 text-xs">
          {([
            ["acumulado", "Acumulado"],
            ["diario", "Por dia"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModo(k)}
              className={`rounded px-2.5 py-1 transition-colors ${
                modo === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Números-chave por forma. O delta é sempre "na mesma altura" — comparar
          com o total final do lançamento anterior diria que estamos perdendo até
          o último dia, o que não ajuda ninguém a decidir nada. */}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3">
        {forms.map((f, i) => {
          const delta = f.deltaPercent;
          const DeltaIcon = delta == null ? Minus : delta >= 0 ? TrendingUp : TrendingDown;
          const deltaCor =
            delta == null
              ? "text-muted-foreground"
              : delta >= 0
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-red-500";
          return (
            <div key={f.sheetId}>
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colorFor(i) }}
                />
                {f.label}
              </p>
              <p className="text-2xl font-semibold leading-none">{nf(f.total)}</p>
              {f.comparacao ? (
                <p className={`mt-1 flex items-center gap-1 text-[11px] ${deltaCor}`}>
                  <DeltaIcon className="h-3 w-3" />
                  {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
                  <span className="text-muted-foreground">vs. anterior</span>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {f.points.length} dia{f.points.length !== 1 ? "s" : ""} de captação
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              // Muitos dias: mostra 1 rótulo a cada N pra não colidir.
              interval={rows.length > 20 ? Math.floor(rows.length / 12) : 0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as Row | undefined;
                if (!row) return null;
                return (
                  <div className="min-w-[210px] rounded-lg border border-border/60 bg-popover px-2.5 py-2 shadow-lg">
                    <p className="mb-1.5 border-b border-border/40 pb-1 text-[11px] font-medium text-muted-foreground">
                      Dia {String(label).replace("D", "")} do lançamento
                      {row.date ? ` · ${fmtDate(row.date)}` : ""}
                    </p>
                    <div className="space-y-1.5">
                      {forms.map((f, i) => {
                        const atual = row[keyAtual(f)] as number | null;
                        const anterior = row[keyAnterior(f)] as number | null;
                        return (
                          <div key={f.sheetId}>
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span
                                  className="inline-block h-0.5 w-3 rounded-full"
                                  style={{ background: colorFor(i) }}
                                />
                                {f.label}
                              </span>
                              <span className="text-sm font-semibold tabular-nums">{nf(atual)}</span>
                            </div>
                            {f.comparacao && (
                              <div className="flex items-baseline justify-between gap-4 pl-[18px]">
                                <span className="text-[10px] text-muted-foreground">anterior</span>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {nf(anterior)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
            {/* Legenda com uma entrada por forma (só a linha do atual entra —
                as tracejadas do anterior ficam fora pra não duplicar o nome). */}
            <Legend
              verticalAlign="top"
              height={26}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }}
            />
            {forms.map((f, i) => (
              <Line
                key={keyAtual(f)}
                name={f.label}
                type="monotone"
                dataKey={keyAtual(f)}
                stroke={colorFor(i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                connectNulls={false}
              />
            ))}
            {forms.map((f, i) =>
              f.comparacao ? (
                <Line
                  key={keyAnterior(f)}
                  name={`${f.label} (anterior)`}
                  type="monotone"
                  dataKey={keyAnterior(f)}
                  stroke={colorFor(i)}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--color-card)", strokeWidth: 2 }}
                  connectNulls={false}
                  legendType="none"
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {showTable ? "Ocultar" : "Ver"} dados em tabela
      </button>
      {showTable && (
        <div className="mt-2 max-h-[300px] overflow-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Dia</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
                {forms.map((f) => (
                  <th key={f.sheetId} className="px-2 py-1.5 text-right font-medium">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dia} className="border-t border-border/30">
                  <td className="px-2 py-1.5">{row.dia}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {row.date ? fmtDate(row.date) : "—"}
                  </td>
                  {forms.map((f) => (
                    <td key={f.sheetId} className="px-2 py-1.5 text-right tabular-nums">
                      {nf(row[keyAtual(f)] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
