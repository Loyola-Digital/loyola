"use client";

/**
 * O gráfico do perfil — o que era só "Alcance Diário".
 *
 * ## Duas escalas, porque as perguntas são duas
 *
 * "Que dia bombou?" se responde no diário, olhando pico. "O perfil está
 * crescendo?" se responde no mensal, olhando a sequência de meses — e essa a
 * linha diária não responde: 30 pontos serrilhados escondem a tendência.
 *
 * ## Por que o diário só tem duas métricas — e mostra as duas de uma vez
 *
 * Medido na Graph API: das nove métricas testadas, só `reach` e
 * `follower_count` devolvem série diária; as outras vêm vazias e virariam uma
 * linha reta em zero. No mensal, onde cada ponto é um total, todas cabem.
 *
 * Sendo duas, não há o que escolher: o alternador virou painel de cima
 * (alcance) e painel de baixo (seguidores novos), porque a pergunta real é
 * "que dia de alcance virou seguidor?" — e ela exige as duas linhas no mesmo
 * eixo de tempo. Escalas separadas, que é o que permite ver 70 mil de alcance
 * e 500 seguidores lado a lado.
 *
 * ## A linha cinza e o fim tracejado
 *
 * A cinza é o mesmo número no período anterior, já buscado pela página para os
 * cartões — sobrepô-la não custa chamada nova. Sem ela, um mês inteiro de
 * alcance não diz se está acima ou abaixo do ritmo.
 *
 * O tracejado são os dois últimos dias, que o Instagram ainda não fechou. Sem
 * essa marca a linha sempre termina em queda, e a queda não existe.
 *
 * O clique no ponto (posts que puxaram o dia) continua, nos dois painéis — um
 * dia de muitos seguidores também tem post por trás.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightEntry, InstagramMedia } from "@/lib/hooks/use-instagram";
import { useInstagramMensal } from "@/lib/hooks/use-instagram-mensal";
import { Dica } from "@/components/instagram/dica";
import {
  DIAS_AINDA_FECHANDO,
  METRICAS_DIARIAS,
  METRICAS_MENSAIS,
  serieDiariaComparada,
  serieMensal,
  type MetricaDoGrafico,
  type PontoDiario,
} from "@/lib/utils/serie-do-perfil";
import { NOME_DO_FORMATO, diasDePico, formatoDoPost, postsDoPico } from "@/lib/utils/instagram-posts";

type Escala = "diario" | "mensal";

const fmtCurto = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(".", ",")}k`;
  return String(v);
};

function Botoes<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { valor: T; rotulo: string; dica?: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/40 p-0.5">
      {opcoes.map((o) => (
        <span key={o.valor} className="inline-flex items-center">
          <button
            type="button"
            onClick={() => onChange(o.valor)}
            className={`h-6 rounded px-2.5 text-[11px] font-medium transition-colors ${
              valor === o.valor
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {o.rotulo}
          </button>
          {o.dica && <Dica className="mr-1">{o.dica}</Dica>}
        </span>
      ))}
    </div>
  );
}

const CINZA_DA_COMPARACAO = "#94a3b8";

/**
 * O balão do dia, escrito à mão.
 *
 * As três linhas do painel (cheia, tracejada, comparação) são três séries do
 * Recharts, e o balão de fábrica listaria as três — duas delas sempre vazias,
 * porque cada dia só pertence a uma. Aqui o dia é lido uma vez, do próprio
 * ponto.
 */
function BalaoDoDia({
  active,
  payload,
  rotulo,
}: {
  active?: boolean;
  payload?: { payload: PontoDiario }[];
  rotulo: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] shadow-md">
      <p className="font-medium">
        {p.rotulo}
        {p.parcial && <span className="font-normal text-muted-foreground"> · ainda fechando</span>}
      </p>
      <p className="tabular-nums">
        {rotulo}: {p.valor.toLocaleString("pt-BR")}
      </p>
      {p.anterior !== null && (
        <p className="tabular-nums text-muted-foreground">
          período anterior: {p.anterior.toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  );
}

/** Um dos dois painéis do diário: alcance em cima, seguidores novos embaixo. */
function PainelDiario({
  metrica,
  pontos,
  picos,
  selecionado,
  onSelecionar,
}: {
  metrica: MetricaDoGrafico;
  pontos: PontoDiario[];
  picos: Set<number>;
  selecionado: number | null;
  onSelecionar: (i: number) => void;
}) {
  if (pontos.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-[12px] text-muted-foreground">
        A Meta não devolveu {metrica.rotulo.toLowerCase()} dia a dia neste período.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 px-1">
        <span className="text-[11px] font-medium" style={{ color: metrica.cor }}>
          {metrica.rotulo}
        </span>
        <Dica>{metrica.dica}</Dica>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={pontos}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          className="cursor-pointer"
          onClick={(e) => {
            const i = e?.activeTooltipIndex;
            if (typeof i === "number") onSelecionar(i);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} width={46} tickFormatter={fmtCurto} stroke="currentColor" className="text-muted-foreground" />
          <Tooltip content={<BalaoDoDia rotulo={metrica.rotulo} />} />
          {/* A comparação vem PRIMEIRO para ficar atrás da linha do período. */}
          <Line
            type="monotone"
            dataKey="anterior"
            stroke={CINZA_DA_COMPARACAO}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="valorFechado"
            stroke={metrica.cor}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              const { cx, cy, index } = props;
              const marcar = index != null && (picos.has(index) || index === selecionado);
              if (!marcar || cx == null || cy == null) return <g key={`d-${index}`} />;
              return (
                <circle
                  key={`d-${index}`}
                  cx={cx}
                  cy={cy}
                  r={index === selecionado ? 5 : 3.5}
                  fill={index === selecionado ? "#fff" : metrica.cor}
                  stroke={metrica.cor}
                  strokeWidth={2}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="fechando"
            stroke={metrica.cor}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoDoPerfil({
  data,
  dataAnterior,
  isLoading,
  error,
  onRefresh,
  isRefreshing,
  posts,
  accountId,
}: {
  data?: InsightEntry[];
  /**
   * O mesmo período, deslocado para trás — a linha cinza de comparação. A
   * página já busca isto para os cartões, então não custa chamada nova.
   */
  dataAnterior?: InsightEntry[];
  isLoading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Posts da conta — o clique num dia mostra os que podem tê-lo puxado. */
  posts?: InstagramMedia[];
  accountId?: string | null;
}) {
  const [escala, setEscala] = useState<Escala>("diario");
  const [metrica, setMetrica] = useState("reach");
  const [selecionado, setSelecionado] = useState<number | null>(null);

  // A mesma busca que a tabela mensal e o comparativo usam — trocar para
  // "Mensal" não custa chamada nova à Meta.
  const mensal = useInstagramMensal(escala === "mensal" ? accountId ?? null : null);

  // Só o mensal tem o que escolher: no diário as duas métricas aparecem
  // juntas, uma em cada painel.
  const atual: MetricaDoGrafico =
    METRICAS_MENSAIS.find((m) => m.chave === metrica) ?? METRICAS_MENSAIS[0]!;

  useEffect(() => {
    setSelecionado(null);
  }, [escala]);

  // Os dois painéis do diário, cada um com a sua escala.
  const diarias = useMemo(
    () =>
      METRICAS_DIARIAS.map((m) => ({
        metrica: m,
        pontos: serieDiariaComparada(data, dataAnterior, m.chave),
      })),
    [data, dataAnterior],
  );
  const picosPorPainel = useMemo(
    () => diarias.map((d) => diasDePico(d.pontos.map((p) => ({ reach: p.valor })))),
    [diarias],
  );
  // O dia escolhido é o mesmo nos dois painéis: as duas séries vêm da mesma
  // janela, com os mesmos dias na mesma ordem.
  const diasDoPeriodo = diarias.find((d) => d.pontos.length > 0)?.pontos ?? [];
  const temComparacao = diasDoPeriodo.some((p) => p.anterior !== null);

  const pontos = useMemo(
    () => serieMensal(mensal.data?.meses as unknown as Record<string, unknown>[], atual.chave),
    [atual.chave, mensal.data],
  );
  const picos = new Set<number>();
  const ponto = selecionado != null ? diasDoPeriodo[selecionado] ?? null : null;
  const doPico = useMemo(
    () => (ponto?.fim && posts ? postsDoPico(posts, ponto.fim) : []),
    [ponto, posts],
  );

  const carregando = isLoading || (escala === "mensal" && mensal.isLoading);
  const vazio = escala === "diario" ? diasDoPeriodo.length === 0 : pontos.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">
              {escala === "diario" ? "Dia a dia" : "Mês a mês"}
            </CardTitle>
            <Dica>
              {`Escolha a escala nos botões; no mensal, também a métrica.

DIÁRIO: dois painéis — alcance em cima, novos seguidores embaixo, no mesmo eixo de tempo. A linha cinza é o mesmo número no período anterior. Os dois últimos dias saem tracejados: o Instagram leva cerca de dois dias para fechá-los, e sem a marca a linha sempre termina numa queda que não existe. Só estas duas métricas têm série diária — medido na API, as outras a Meta não entrega dia a dia. Os 3 maiores dias ficam marcados, e clicar num ponto mostra os posts publicados nas 72h até ali.

MENSAL: os últimos 24 meses (tudo o que a Meta guarda), com tudo — inclusive a curva de seguidores e o saldo, que fica abaixo do zero quando o perfil encolheu. Vem da mesma busca da tabela mensal, então trocar não custa consulta.`}
            </Dica>
          </div>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botoes
            valor={escala}
            onChange={(v) => setEscala(v)}
            opcoes={[
              { valor: "diario" as Escala, rotulo: "Diário" },
              { valor: "mensal" as Escala, rotulo: "Mensal" },
            ]}
          />
          {escala === "mensal" && (
            <Botoes
              valor={atual.chave}
              onChange={setMetrica}
              opcoes={METRICAS_MENSAIS.map((m) => ({ valor: m.chave, rotulo: m.rotulo, dica: m.dica }))}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <div className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-destructive">
            {error.message}
          </div>
        ) : vazio ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sem dados no período.
          </div>
        ) : escala === "diario" ? (
          <div className="overflow-x-auto">
            <div className="min-w-[400px] space-y-2">
              {diarias.map((d, i) => (
                <PainelDiario
                  key={d.metrica.chave}
                  metrica={d.metrica}
                  pontos={d.pontos}
                  picos={picosPorPainel[i] ?? new Set()}
                  selecionado={selecionado}
                  onSelecionar={(idx) => setSelecionado(idx === selecionado ? null : idx)}
                />
              ))}
            </div>

            {/* Legenda escrita, não só cor: a cinza e o tracejado não se
                explicam sozinhos. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {temComparacao && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-0 w-5 border-t-2"
                    style={{ borderColor: CINZA_DA_COMPARACAO, opacity: 0.5 }}
                  />
                  período anterior
                </span>
              )}
              {diasDoPeriodo.some((p) => p.parcial) && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-0 w-5 border-t-2 border-dashed border-current"
                  />
                  últimos {DIAS_AINDA_FECHANDO} dias ainda fechando
                </span>
              )}
            </div>

            {ponto ? (
              <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px]">
                    <span className="font-semibold">{ponto.rotulo}</span>
                    {diarias.map((d) => {
                      const v = d.pontos[selecionado!];
                      return v == null ? null : (
                        <span key={d.metrica.chave}>
                          {" · "}
                          {d.metrica.rotulo.toLowerCase()}{" "}
                          <span className="tabular-nums">{v.valor.toLocaleString("pt-BR")}</span>
                        </span>
                      );
                    })}
                    <span className="text-muted-foreground"> — posts publicados nas 72h até este dia</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelecionado(null)}
                    aria-label="Fechar"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {doPico.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    Nenhum post publicado nesses dias — veio de posts mais antigos, stories ou do perfil.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {doPico.map((p) => {
                      const thumb = p.thumbnail_url ?? p.media_url;
                      return (
                        <li key={p.id} className="flex items-center gap-2 text-[12px]">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                          )}
                          <span className="w-16 shrink-0 text-muted-foreground">
                            {NOME_DO_FORMATO[formatoDoPost(p)]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{p.caption ?? "—"}</span>
                          <span className="shrink-0 tabular-nums">
                            {(p.reach ?? 0).toLocaleString("pt-BR")} alcance
                          </span>
                          {p.permalink && (
                            <a
                              href={p.permalink}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label="Abrir no Instagram"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Clique num ponto para ver os posts que puxaram aquele dia.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[400px]">
              <ResponsiveContainer width="100%" height={240}>
                {atual.barra ? (
                  <BarChart
                    data={pontos}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                    onClick={(e) => {
                      const i = e?.activeTooltipIndex;
                      if (typeof i === "number") setSelecionado(i === selecionado ? null : i);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={fmtCurto} stroke="currentColor" className="text-muted-foreground" />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => [Number(v).toLocaleString("pt-BR"), atual.rotulo]}
                    />
                    <Bar dataKey="valor" name={atual.rotulo} radius={[2, 2, 0, 0]}>
                      {pontos.map((p, i) => (
                        // Saldo negativo em vermelho: a cor conta a história
                        // que a altura da barra sozinha não conta.
                        <Cell key={i} fill={p.valor < 0 ? "#ef4444" : atual.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <LineChart
                    data={pontos}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={fmtCurto} stroke="currentColor" className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => [Number(v).toLocaleString("pt-BR"), atual.rotulo]}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      name={atual.rotulo}
                      stroke={atual.cor}
                      strokeWidth={2}
                      dot={(props: { cx?: number; cy?: number; index?: number }) => {
                        const { cx, cy, index } = props;
                        const marcar = index != null && (picos.has(index) || index === selecionado);
                        if (!marcar || cx == null || cy == null) return <g key={`d-${index}`} />;
                        return (
                          <circle
                            key={`d-${index}`}
                            cx={cx}
                            cy={cy}
                            r={index === selecionado ? 5 : 3.5}
                            fill={index === selecionado ? "#fff" : atual.cor}
                            stroke={atual.cor}
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
