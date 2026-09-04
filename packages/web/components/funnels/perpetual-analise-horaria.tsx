"use client";

/**
 * Seção "Análise detalhada no período" do Perpétuo — Stories 29.70, 29.71 e
 * 29.72.
 *
 * Três linhas de dois painéis cada, todos com a mesma forma: o eixo X é **por
 * hora do dia** (24 posições) à esquerda e **por dia da semana** (7) à direita.
 *
 * | Linha | Barras | Linha | Story |
 * |---|---|---|---|
 * | 1 | Faturamento (R$) | Vendas | 29.70 |
 * | 2 | Investimento (R$) | ROAS | 29.71 |
 * | 3 | Margem de Contribuição (R$) | — (barras coloridas) | 29.72 |
 *
 * O dado vem pronto da rota `/perpetual/hourly` (29.69): as posições chegam
 * **sempre todas**, mesmo zeradas, e a cobertura vem junto. Nada é derivado
 * aqui — ROAS e margem já vêm calculados dos somatórios da posição, que é o que
 * impede "média de médias".
 */

import {
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, CalendarDays, AlertTriangle } from "lucide-react";
import type { PerpetualHourlyData, PerpetualHourlyPosition } from "@loyola-x/shared";
import { fmtCurrency, fmtInt } from "@/lib/utils/format-number";
import {
  PISO_DE_COBERTURA_HORARIA,
  coberturaDeHora,
  rotuloDaHora,
  type LinhaDaAnalise,
} from "@/lib/utils/perpetual-analise-horaria";

/** Roxo do design system para volume; âmbar para a série de eficiência. */
const COR_BARRA = "hsl(260 60% 65%)";
/**
 * Story 29.70 (AC5): o pedido dizia "linha branca", que some no tema claro.
 * Este âmbar é o mesmo já usado na série de Investimento do gráfico de 7 dias
 * deste arquivo, e tem contraste nos dois temas.
 */
const COR_LINHA = "hsl(47 98% 54%)";
const COR_POSITIVA = "hsl(142 71% 45%)";
const COR_NEGATIVA = "hsl(0 72% 55%)";

interface PosicaoPlotada extends PerpetualHourlyPosition {
  rotulo: string;
}

function PainelVazio({ motivo }: { motivo: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border/40 px-6">
      <p className="text-center text-xs text-muted-foreground">{motivo}</p>
    </div>
  );
}

function TooltipDaPosicao({
  active,
  payload,
  linha,
}: {
  active?: boolean;
  payload?: { payload: PosicaoPlotada }[];
  linha: LinhaDaAnalise;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  // Story 29.72 (AC5) — o memorial da margem, na ordem em que a conta fecha.
  // Bruto − fees = líquido; líquido − investimento = margem. Mostrar só o
  // resultado deixaria o leitor sem como conferir de onde ele veio.
  const fees = p.faturamentoBruto - p.faturamentoLiquido;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{p.rotulo}</p>
      {linha === "faturamento" && (
        <>
          <Riscado rotulo="Faturamento" valor={fmtCurrency(p.faturamentoBruto)} />
          <Riscado rotulo="Vendas" valor={fmtInt(p.vendas)} />
          <Riscado
            rotulo="Ticket médio"
            valor={p.vendas > 0 ? fmtCurrency(p.faturamentoBruto / p.vendas) : "—"}
          />
        </>
      )}
      {linha === "investimento" && (
        <>
          <Riscado rotulo="Investimento" valor={fmtCurrency(p.investimento)} />
          <Riscado rotulo="Faturamento" valor={fmtCurrency(p.faturamentoBruto)} />
          <Riscado
            rotulo="ROAS"
            valor={p.roas == null ? "—" : `${p.roas.toFixed(2)}x`}
          />
          {p.roas == null && p.faturamentoBruto > 0 && (
            // Story 29.71 (AC4): sem isto, o leitor vê a barra zerada com venda
            // em cima e conclui que o gráfico perdeu o gasto.
            <p className="mt-1 max-w-[220px] text-[10px] text-muted-foreground">
              Venda nesta posição, sem gasto registrado — o ROAS não é plotado.
            </p>
          )}
        </>
      )}
      {linha === "margem" && (
        <>
          <Riscado rotulo="Receita bruta" valor={fmtCurrency(p.faturamentoBruto)} />
          <Riscado rotulo="− Fees da plataforma" valor={fmtCurrency(fees)} />
          <Riscado rotulo="= Receita líquida" valor={fmtCurrency(p.faturamentoLiquido)} />
          <Riscado rotulo="− Investimento" valor={fmtCurrency(p.investimento)} />
          <div className="mt-1 border-t border-border/60 pt-1">
            <Riscado
              rotulo="= Margem"
              valor={fmtCurrency(p.margem)}
              destaque={p.margem >= 0 ? "positiva" : "negativa"}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Riscado({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: "positiva" | "negativa";
}) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-muted-foreground">{rotulo}</span>
      <span
        className={
          destaque === "positiva"
            ? "font-semibold tabular-nums text-emerald-500"
            : destaque === "negativa"
              ? "font-semibold tabular-nums text-red-500"
              : "tabular-nums"
        }
      >
        {valor}
      </span>
    </div>
  );
}

function Painel({
  titulo,
  subtitulo,
  icone: Icone,
  dados,
  linha,
  aviso,
}: {
  titulo: string;
  subtitulo?: string | null;
  icone: typeof Clock;
  dados: PosicaoPlotada[];
  linha: LinhaDaAnalise;
  aviso?: string | null;
}) {
  const temAlgo = dados.some(
    (d) => d.faturamentoBruto !== 0 || d.investimento !== 0 || d.vendas !== 0,
  );

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h4>
      </div>
      {subtitulo && (
        <p className="mb-2 text-[11px] leading-tight text-muted-foreground">{subtitulo}</p>
      )}

      {aviso ? (
        <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-6">
          <div className="flex max-w-sm items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-muted-foreground">{aviso}</p>
          </div>
        </div>
      ) : !temAlgo ? (
        <PainelVazio motivo="Sem dados no período selecionado." />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 10 }}
              stroke="var(--color-muted-foreground)"
              interval={0}
              angle={dados.length > 12 ? -45 : 0}
              textAnchor={dados.length > 12 ? "end" : "middle"}
              height={dados.length > 12 ? 46 : 24}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v: number) => fmtCurrency(v)}
              width={78}
            />
            {linha !== "margem" && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                stroke="var(--color-muted-foreground)"
                allowDecimals={linha === "investimento"}
                tickFormatter={(v: number) =>
                  linha === "investimento" ? `${v.toFixed(2)}x` : fmtInt(v)
                }
                width={56}
              />
            )}
            <Tooltip
              content={(props) => (
                <TooltipDaPosicao
                  active={props.active}
                  // O `payload` do recharts é readonly; o componente só lê.
                  payload={
                    props.payload as unknown as { payload: PosicaoPlotada }[] | undefined
                  }
                  linha={linha}
                />
              )}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* Story 29.72 (AC3): a base em zero precisa estar visível para a
                barra negativa ser lida como negativa, e não como barra curta. */}
            {linha === "margem" && (
              <ReferenceLine yAxisId="left" y={0} stroke="var(--color-border)" />
            )}
            <Bar
              yAxisId="left"
              dataKey={
                linha === "faturamento"
                  ? "faturamentoBruto"
                  : linha === "investimento"
                    ? "investimento"
                    : "margem"
              }
              name={
                linha === "faturamento"
                  ? "Faturamento"
                  : linha === "investimento"
                    ? "Investimento"
                    : "Margem de Contribuição"
              }
              fill={COR_BARRA}
              isAnimationActive={false}
              radius={[3, 3, 0, 0]}
            >
              {linha === "margem" &&
                dados.map((d, i) => (
                  <Cell key={i} fill={d.margem >= 0 ? COR_POSITIVA : COR_NEGATIVA} />
                ))}
            </Bar>
            {linha !== "margem" && (
              // `connectNulls={false}`: posição sem ROAS fica com LACUNA. Ligar
              // os pontos por cima dela inventaria continuidade onde não há
              // medição (29.71, AC4).
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={linha === "faturamento" ? "vendas" : "roas"}
                name={linha === "faturamento" ? "Vendas" : "ROAS"}
                stroke={COR_LINHA}
                strokeWidth={2}
                dot={{ r: 3, fill: COR_LINHA }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function PerpetualAnaliseHoraria({
  data,
  isLoading,
}: {
  data: PerpetualHourlyData | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="h-[300px] animate-pulse rounded-xl bg-muted/20" />;
  }
  if (!data || data.semDados) return null;

  const cob = coberturaDeHora(data.cobertura);

  const porHora: PosicaoPlotada[] = data.porHora.map((p) => ({
    ...p,
    rotulo: rotuloDaHora(p.hora),
  }));
  const porDia: PosicaoPlotada[] = data.porDiaDaSemana.map((p) => ({
    ...p,
    rotulo: p.nome,
  }));

  /**
   * Story 29.70 (AC7) e 29.71 (AC5) — abaixo do piso, o painel por hora mostra
   * o aviso EM VEZ do gráfico.
   *
   * Meio gráfico apresentado como inteiro é pior que nenhum: medido em
   * produção, o `fz-a1` tem 5% das vendas com hora, e o painel mostraria
   * R$ 4.720 ao lado de um painel de dia da semana com R$ 90.974.
   */
  const avisoDaHora = cob.abaixoDoPiso
    ? `Só ${cob.percentual}% das vendas do período têm hora registrada ` +
      `(${fmtInt(cob.vendasComHora)} de ${fmtInt(cob.totalVendas)}, ` +
      `${fmtCurrency(cob.faturamentoComHora)} de ${fmtCurrency(cob.faturamentoTotal)}). ` +
      `Abaixo de ${PISO_DE_COBERTURA_HORARIA}% o corte por hora não representa o funil, ` +
      `então o gráfico não é desenhado. O corte por dia da semana ao lado usa todas as vendas.`
    : null;

  const subtituloHora = [
    cob.totalVendas > 0
      ? `${fmtInt(cob.vendasComHora)} de ${fmtInt(cob.totalVendas)} vendas têm hora registrada`
      : null,
    // Story 29.71 (AC6): fuso declarado. `null` = não verificado, que é
    // diferente de verificado e igual.
    data.cobertura.accountTimezone
      ? `investimento no fuso da conta (${data.cobertura.accountTimezone})`
      : "fuso da conta de anúncios não verificado",
    // Story 29.71 (AC5): até onde o cache horário cobre.
    data.cobertura.primeiroDiaComCacheHorario
      ? `investimento por hora desde ${data.cobertura.primeiroDiaComCacheHorario}`
      : "sem investimento por hora ainda sincronizado",
  ]
    .filter(Boolean)
    .join(" · ");

  const subtituloDia = "Todas as vendas do período — não depende da hora";

  const linhas: { linha: LinhaDaAnalise; titulo: string }[] = [
    { linha: "faturamento", titulo: "Faturamento × Vendas" },
    { linha: "investimento", titulo: "Investimento × ROAS" },
    { linha: "margem", titulo: "Margem de Contribuição" },
  ];

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h3 className="text-sm font-semibold">Análise detalhada no período</h3>
        <p className="text-xs text-muted-foreground">
          Em que hora do dia e em que dia da semana o funil performa.
        </p>
      </div>

      {linhas.map(({ linha, titulo }) => (
        <div key={linha} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <Painel
              titulo="Por hora do dia"
              subtitulo={subtituloHora}
              icone={Clock}
              dados={porHora}
              linha={linha}
              aviso={avisoDaHora}
            />
            <Painel
              titulo="Por dia da semana"
              subtitulo={subtituloDia}
              icone={CalendarDays}
              dados={porDia}
              linha={linha}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
