"use client";

/**
 * O desenho de um widget.
 *
 * Recharts, que é o que o app já usa — trocar de biblioteca de gráfico por causa
 * desta tela seria pagar uma migração inteira para não ganhar nada.
 *
 * Três estados de vazio, e são diferentes: **carregando** (esqueleto),
 * **sem amostra** ("sem dados no período" — nunca `0`) e **erro** (o motivo, no
 * lugar do gráfico, para o card falhar sozinho sem levar o dashboard junto).
 */

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatar, formatarCurto, TRACO, type TipoSemantico } from "@/lib/bi/formato";
import type { ResultadoDaQuery, Widget } from "@/lib/bi/tipos";
import { ehErro, type ResultadoDoWidget } from "@/lib/hooks/use-bi";

/**
 * As cores das séries.
 *
 * Hex fixo, e não token de tema: o `globals.css` deste app não define
 * `--chart-N`, e uma variável inexistente vira cor transparente — o gráfico
 * sumiria sem erro nenhum no console.
 */
const CORES = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export function WidgetConteudo({
  widget,
  resultado,
  carregando,
}: {
  widget: Widget;
  resultado: ResultadoDoWidget | undefined;
  carregando?: boolean;
}) {
  if (carregando || !resultado) return <Esqueleto tipo={widget.tipo} />;

  if (ehErro(resultado)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertTriangle className="size-5 text-amber-500" />
        <p className="text-xs text-muted-foreground">{resultado.erro}</p>
      </div>
    );
  }

  if (resultado.rows.length === 0) {
    // "Sem dados no período" e não `0`: o zero afirma uma medição que não houve.
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-xs text-muted-foreground">Sem dados no período</p>
      </div>
    );
  }

  switch (widget.tipo) {
    case "kpi":
      return <Kpi resultado={resultado} />;
    case "linha":
      return <Linha resultado={resultado} />;
    case "barra":
      return <Barra resultado={resultado} />;
    case "pizza":
      return <Pizza resultado={resultado} />;
    case "funil":
      return <Funil resultado={resultado} />;
    case "tabela":
      return <Tabela resultado={resultado} />;
  }
}

function Esqueleto({ tipo }: { tipo: Widget["tipo"] }) {
  if (tipo === "kpi") {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    );
  }
  if (tipo === "tabela") {
    return (
      <div className="flex h-full flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }
  return <Skeleton className="h-full w-full" />;
}

// ============================================================
// Tipos de widget
// ============================================================

function Kpi({ resultado }: { resultado: ResultadoDaQuery }) {
  const linha = resultado.rows[0]!;
  const metricas = resultado.columns.filter((c) => !ehDimensao(c, resultado));

  return (
    <div className="flex h-full flex-wrap items-center justify-around gap-3">
      {metricas.map((c) => (
        <div key={c.key} className="min-w-0">
          <p className="truncate text-2xl font-semibold tabular-nums">
            {formatar(linha[c.key], c.semanticType as TipoSemantico)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

function Linha({ resultado }: { resultado: ResultadoDaQuery }) {
  const { dimensao, metricas, dados } = separar(resultado);
  if (!dimensao) return <Kpi resultado={resultado} />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="__rotulo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatarCurto(v, metricas[0]!.semanticType as TipoSemantico)}
        />
        <Tooltip content={<Dica resultado={resultado} />} />
        {metricas.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {metricas.map((m, i) => (
          <Line
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.label}
            stroke={CORES[i % CORES.length]}
            strokeWidth={2}
            dot={false}
            // Sem isto o Recharts liga os pontos por cima do buraco, e um dia
            // sem amostra vira uma reta que sugere continuidade.
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Barra({ resultado }: { resultado: ResultadoDaQuery }) {
  const { dimensao, metricas, dados } = separar(resultado);
  if (!dimensao) return <Kpi resultado={resultado} />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="__rotulo"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatarCurto(v, metricas[0]!.semanticType as TipoSemantico)}
        />
        <Tooltip content={<Dica resultado={resultado} />} cursor={{ opacity: 0.1 }} />
        {metricas.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {metricas.map((m, i) => (
          <Bar key={m.key} dataKey={m.key} name={m.label} fill={CORES[i % CORES.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Pizza({ resultado }: { resultado: ResultadoDaQuery }) {
  const { dimensao, metricas, dados } = separar(resultado);
  const metrica = metricas[0];
  if (!dimensao || !metrica) return <Kpi resultado={resultado} />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={dados} dataKey={metrica.key} nameKey="__rotulo" innerRadius="45%" outerRadius="75%">
          {dados.map((_, i) => (
            <Cell key={i} fill={CORES[i % CORES.length]} />
          ))}
        </Pie>
        <Tooltip content={<Dica resultado={resultado} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/**
 * O funil: barras horizontais proporcionais, com a queda entre etapas.
 *
 * Recharts não tem gráfico de funil, e a conversão entre etapas é justamente o
 * número que se olha — desenhar à mão é mais honesto que forçar um `BarChart`
 * deitado sem a queda.
 */
function Funil({ resultado }: { resultado: ResultadoDaQuery }) {
  const metricas = resultado.columns.filter((c) => !ehDimensao(c, resultado));
  const linha = resultado.rows[0]!;
  const etapas = metricas.map((m) => ({
    label: m.label,
    valor: typeof linha[m.key] === "number" ? (linha[m.key] as number) : null,
    tipo: m.semanticType as TipoSemantico,
  }));
  const topo = etapas[0]?.valor ?? 0;

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {etapas.map((e, i) => {
        const anterior = etapas[i - 1]?.valor ?? null;
        const largura = topo && e.valor !== null ? Math.max(6, (e.valor / topo) * 100) : 6;
        // Conversão só existe com denominador — sem ele, traço.
        const conversao = anterior && e.valor !== null ? (e.valor / anterior) * 100 : null;
        return (
          <div key={e.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{e.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatar(e.valor, e.tipo)}</span>
            </div>
            <div className="h-3 w-full rounded bg-muted">
              <div
                className="h-3 rounded bg-primary/70"
                style={{ width: `${largura}%` }}
              />
            </div>
            {i > 0 && (
              <p className="text-right text-[10px] text-muted-foreground tabular-nums">
                {conversao === null ? TRACO : `${conversao.toFixed(1)}% da etapa anterior`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Tabela({ resultado }: { resultado: ResultadoDaQuery }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b">
            {resultado.columns.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-1.5 font-medium text-muted-foreground ${
                  c.semanticType === "text" || c.semanticType === "date" ? "text-left" : "text-right"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resultado.rows.map((linha, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
              {resultado.columns.map((c) => {
                const texto = c.semanticType === "text" || c.semanticType === "date";
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 ${texto ? "max-w-[220px] truncate" : "text-right tabular-nums"}`}
                    title={texto ? String(linha[c.key] ?? "") : undefined}
                  >
                    {formatar(linha[c.key], c.semanticType as TipoSemantico)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Apoio
// ============================================================

function ehDimensao(
  coluna: ResultadoDaQuery["columns"][number],
  resultado: ResultadoDaQuery,
): boolean {
  // A dimensão é sempre a primeira coluna quando existe — o executor devolve
  // dimensões antes de métricas.
  return resultado.columns.indexOf(coluna) < contarDimensoes(resultado);
}

function contarDimensoes(resultado: ResultadoDaQuery): number {
  // `date` e `text` só aparecem como dimensão; métrica é sempre numérica.
  let n = 0;
  for (const c of resultado.columns) {
    if (c.semanticType === "date" || c.semanticType === "text") n += 1;
    else break;
  }
  return n;
}

function separar(resultado: ResultadoDaQuery) {
  const n = contarDimensoes(resultado);
  const dimensao = resultado.columns[0] && n > 0 ? resultado.columns[0] : null;
  const metricas = resultado.columns.slice(n);
  const dados = resultado.rows.map((linha) => ({
    ...linha,
    __rotulo: dimensao
      ? formatar(linha[dimensao.key], dimensao.semanticType as TipoSemantico)
      : "",
  }));
  return { dimensao, metricas, dados };
}

function Dica({
  active,
  payload,
  label,
  resultado,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number | null; color?: string }[];
  label?: string;
  resultado: ResultadoDaQuery;
}) {
  const tipos = useMemo(
    () => Object.fromEntries(resultado.columns.map((c) => [c.key, c.semanticType])),
    [resultado.columns],
  );
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {formatar(
              p.value ?? null,
              (tipos[String(p.dataKey)] as TipoSemantico) ?? "number",
            )}
          </span>
        </p>
      ))}
    </div>
  );
}
