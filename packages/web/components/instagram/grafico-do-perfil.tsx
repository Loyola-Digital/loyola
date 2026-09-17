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
 * ## Por que o diário só tem duas métricas
 *
 * Medido na Graph API: das nove métricas testadas, só `reach` e
 * `follower_count` devolvem série diária; as outras vêm vazias e virariam uma
 * linha reta em zero. No mensal, onde cada ponto é um total, todas cabem.
 *
 * O clique no ponto (posts que puxaram o dia) continua, e vale para as duas
 * métricas diárias — um dia de muitos seguidores também tem post por trás.
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
  METRICAS_DIARIAS,
  METRICAS_MENSAIS,
  serieDiaria,
  serieMensal,
  type MetricaDoGrafico,
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

export function GraficoDoPerfil({
  data,
  isLoading,
  error,
  onRefresh,
  isRefreshing,
  posts,
  accountId,
}: {
  data?: InsightEntry[];
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
  const mensal = useInstagramMensal(escala === "mensal" ? accountId ?? null : null, 12);

  const catalogo = escala === "diario" ? METRICAS_DIARIAS : METRICAS_MENSAIS;
  const atual: MetricaDoGrafico =
    catalogo.find((m) => m.chave === metrica) ?? catalogo[0]!;

  // Trocar de escala pode deixar uma métrica que não existe do outro lado.
  useEffect(() => {
    if (!catalogo.some((m) => m.chave === metrica)) setMetrica(catalogo[0]!.chave);
    setSelecionado(null);
  }, [escala, catalogo, metrica]);

  const pontos = useMemo(
    () =>
      escala === "diario"
        ? serieDiaria(data, atual.chave)
        : serieMensal(mensal.data?.meses as unknown as Record<string, unknown>[], atual.chave),
    [escala, data, atual.chave, mensal.data],
  );
  const picos = useMemo(
    () => (escala === "diario" ? diasDePico(pontos.map((p) => ({ reach: p.valor }))) : new Set<number>()),
    [escala, pontos],
  );
  const ponto = selecionado != null ? pontos[selecionado] ?? null : null;
  const doPico = useMemo(
    () => (ponto?.fim && posts ? postsDoPico(posts, ponto.fim) : []),
    [ponto, posts],
  );

  const carregando = isLoading || (escala === "mensal" && mensal.isLoading);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">
              {escala === "diario" ? "Dia a dia" : "Mês a mês"}
            </CardTitle>
            <Dica>
              {`Escolha a escala e a métrica nos botões.

DIÁRIO: só alcance e novos seguidores — medido na API, as outras métricas a Meta não entrega dia a dia, e virariam uma linha em zero. Os 3 maiores dias ficam marcados, e clicar num ponto mostra os posts publicados nas 72h até ali.

MENSAL: os últimos 12 meses, com tudo — inclusive a curva de seguidores e o saldo, que fica abaixo do zero quando o perfil encolheu. Vem da mesma busca da tabela mensal, então trocar não custa consulta.`}
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
          <Botoes
            valor={atual.chave}
            onChange={setMetrica}
            opcoes={catalogo.map((m) => ({ valor: m.chave, rotulo: m.rotulo, dica: m.dica }))}
          />
        </div>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <div className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-destructive">
            {error.message}
          </div>
        ) : pontos.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sem dados no período.
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
                    className={escala === "diario" ? "cursor-pointer" : undefined}
                    onClick={(e) => {
                      const i = e?.activeTooltipIndex;
                      if (typeof i === "number") setSelecionado(i === selecionado ? null : i);
                    }}
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

            {escala === "diario" && ponto ? (
              <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px]">
                    <span className="font-semibold">{ponto.rotulo}</span> · {atual.rotulo.toLowerCase()}{" "}
                    <span className="tabular-nums">{ponto.valor.toLocaleString("pt-BR")}</span>
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
            ) : escala === "diario" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Clique num ponto para ver os posts que puxaram aquele dia.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
