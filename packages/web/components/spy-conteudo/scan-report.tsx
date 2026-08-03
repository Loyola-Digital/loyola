"use client";

/**
 * Spy de Conteúdo — o relatório de um perfil.
 *
 * Todo número vem de `metrics` (calculado em código no backend); `analysis` é a
 * leitura qualitativa da Claude. Essa separação é o que impede número alucinado.
 *
 * Gráficos seguem o método de dataviz: uma série = uma cor, grid hairline
 * sólido, tooltip com o valor liderando, e tabela equivalente em todo gráfico
 * (o tooltip enriquece, nunca é o único caminho pro dado).
 */

import {
  Loader2, Clock, XCircle, ExternalLink, AlertTriangle, MessageCircleQuestion,
  Instagram, BadgeCheck,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useInstagramScan, type ScanDetail, type ScanMetrics } from "@/lib/hooks/use-instagram-scans";
import {
  ChartCard, StatTile, VizTooltip, axisProps, gridProps,
  nf, nfCompact, VIZ_SERIES_1, VIZ_ORDINAL, VIZ_CATEGORICAL,
} from "./viz";

const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** "2026-07" → "jul/26" — o eixo precisa caber sem girar o rótulo. */
function fmtMes(mes: string): string {
  const [a, m] = mes.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${a.slice(2)}`;
}

// ============================================================
// GRÁFICOS
// ============================================================

function EngajamentoPorMes({ metrics }: { metrics: ScanMetrics }) {
  const data = metrics.porMes.map((d) => ({ ...d, label: fmtMes(d.mes) }));
  if (data.length < 2) return null;
  return (
    <ChartCard
      title="Engajamento ao longo do tempo"
      hint="Média por publicação em cada mês"
      table={{
        head: ["Mês", "Publicações", "Engajamento médio"],
        rows: data.map((d) => [d.label, d.posts, d.engajamentoMedio]),
      }}
    >
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {/* Wash a ~10% — área é preenchimento leve, nunca bloco saturado. */}
              <linearGradient id="spyArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIZ_SERIES_1} stopOpacity={0.18} />
                <stop offset="100%" stopColor={VIZ_SERIES_1} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={nfCompact} />
            <Tooltip
              cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof data)[0] | undefined;
                if (!d) return null;
                return (
                  <VizTooltip
                    active={active}
                    title={d.label}
                    rows={[
                      { label: "Engajamento médio", value: nf(d.engajamentoMedio), color: VIZ_SERIES_1 },
                      { label: "Publicações", value: nf(d.posts) },
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="engajamentoMedio"
              stroke={VIZ_SERIES_1}
              strokeWidth={2}
              fill="url(#spyArea)"
              // Marcador ≥8px com anel na cor da superfície, pra sobreviver ao cruzar a linha.
              dot={{ r: 3, fill: VIZ_SERIES_1, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: VIZ_SERIES_1, stroke: "var(--color-card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Barras de série única — todas na mesma cor. Colorir por tamanho seria codificar o valor duas vezes. */
function BarrasSimples({
  title,
  hint,
  data,
  xKey,
  xLabel,
  colors,
}: {
  title: string;
  hint?: string;
  data: { posts: number; engajamentoMedio: number; [k: string]: string | number }[];
  xKey: string;
  xLabel: string;
  /** Só quando as categorias são ORDENADAS (rampa ordinal). */
  colors?: string[];
}) {
  const semDados = data.every((d) => d.posts === 0);
  if (semDados) return null;
  return (
    <ChartCard
      title={title}
      hint={hint}
      table={{
        head: [xLabel, "Publicações", "Engajamento médio"],
        rows: data.map((d) => [String(d[xKey]), d.posts, d.engajamentoMedio]),
      }}
    >
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xKey} {...axisProps} interval={0} />
            <YAxis {...axisProps} width={48} tickFormatter={nfCompact} />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof data)[0] | undefined;
                if (!d) return null;
                return (
                  <VizTooltip
                    active={active}
                    title={String(d[xKey])}
                    rows={[
                      {
                        label: "Engajamento médio",
                        value: nf(d.engajamentoMedio),
                        color: colors ? colors[data.indexOf(d) % colors.length] : VIZ_SERIES_1,
                      },
                      { label: "Publicações", value: nf(d.posts) },
                    ]}
                  />
                );
              }}
            />
            {/* maxBarSize: a barra não preenche a faixa — a sobra é o ar. */}
            <Bar dataKey="engajamentoMedio" radius={[4, 4, 0, 0]} maxBarSize={24}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors ? colors[i % colors.length] : VIZ_SERIES_1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Mix de formato: part-to-whole com 3 segmentos — aqui identidade importa, então paleta categórica. */
function MixDeFormato({ metrics }: { metrics: ScanMetrics }) {
  const total = metrics.formatos.reduce((s, f) => s + f.posts, 0);
  if (!total) return null;
  return (
    <ChartCard
      title="Mix de formato"
      hint="Quanto do feed é cada formato, e quanto cada um engaja"
      table={{
        head: ["Formato", "Publicações", "Share", "Engajamento médio"],
        rows: metrics.formatos.map((f) => [f.formato, f.posts, `${f.share}%`, f.engajamentoMedio]),
      }}
    >
      <div className="space-y-3">
        {/* Barra empilhada: 2px de gap na cor da superfície separa os segmentos —
            nunca uma borda desenhada em volta. */}
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {metrics.formatos.map((f, i) => (
            <div
              key={f.formato}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${f.share}%`,
                background: VIZ_CATEGORICAL[i % VIZ_CATEGORICAL.length],
                marginRight: i < metrics.formatos.length - 1 ? 2 : 0,
              }}
              title={`${f.formato}: ${f.share}%`}
            />
          ))}
        </div>
        {/* Legenda sempre presente com 2+ séries — identidade nunca é só cor.
            O rótulo usa token de texto; a marca colorida ao lado carrega a identidade. */}
        <div className="grid gap-2 sm:grid-cols-3">
          {metrics.formatos.map((f, i) => (
            <div key={f.formato} className="rounded-lg border border-border/40 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: VIZ_CATEGORICAL[i % VIZ_CATEGORICAL.length] }}
                />
                <span className="text-xs font-medium">{f.formato}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{f.share}%</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {nf(f.posts)} posts · {nf(f.engajamentoMedio)} engaj. médio
              </p>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

function TopHashtags({ metrics }: { metrics: ScanMetrics }) {
  if (!metrics.hashtags.length) return null;
  const max = Math.max(...metrics.hashtags.map((h) => h.usos));
  return (
    <ChartCard
      title="Hashtags mais usadas"
      hint="Barra = frequência de uso; o engajamento médio de cada uma vai ao lado"
      table={{
        head: ["Hashtag", "Usos", "Engajamento médio"],
        rows: metrics.hashtags.map((h) => [`#${h.tag}`, h.usos, h.engajamentoMedio]),
      }}
    >
      <div className="space-y-1.5">
        {metrics.hashtags.slice(0, 10).map((h) => (
          <div key={h.tag} className="flex items-center gap-2">
            <span className="w-[34%] shrink-0 truncate text-xs" title={`#${h.tag}`}>
              #{h.tag}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full"
                style={{ width: `${(h.usos / max) * 100}%`, background: VIZ_SERIES_1 }}
              />
            </div>
            {/* Rótulo direto no fim da barra — o valor não depende de hover. */}
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {h.usos}×
            </span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {nfCompact(h.engajamentoMedio)}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ============================================================
// MÉTRICAS
// ============================================================

function MetricsView({ metrics }: { metrics: ScanMetrics }) {
  const { engajamento, reels, totais, frequencia, janela, legenda } = metrics;
  const ocultos = totais.analisados - totais.comEngajamentoVisivel;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Taxa de engajamento"
          value={pct(engajamento.taxaPorSeguidor)}
          sub="engajamento médio ÷ seguidores"
          accent
        />
        <StatTile
          label="Engajamento médio"
          value={nfCompact(engajamento.media)}
          sub={`mediana ${nfCompact(engajamento.mediana)}`}
        />
        <StatTile
          label="Cadência"
          value={`${frequencia.porSemana}/sem`}
          sub={frequencia.intervaloMedioDias != null ? `1 post a cada ${frequencia.intervaloMedioDias} dias` : undefined}
        />
        <StatTile
          label="Views médias (Reels)"
          value={reels.mediaViews != null ? nfCompact(reels.mediaViews) : "—"}
          sub={reels.alcanceVsSeguidores != null ? `${reels.alcanceVsSeguidores}× a base de seguidores` : "Instagram não expôs"}
        />
        <StatTile label="Curtidas médias" value={nfCompact(engajamento.mediaCurtidas)} sub={`mediana ${nfCompact(engajamento.medianaCurtidas)}`} />
        <StatTile
          label="Comentários médios"
          value={nfCompact(engajamento.mediaComentarios)}
          sub={engajamento.razaoComentarioCurtida != null ? `${pct(engajamento.razaoComentarioCurtida)} das curtidas` : undefined}
        />
        <StatTile label="Publicações analisadas" value={nf(totais.analisados)} sub={`${totais.reels} reels · ${totais.carrosseis} carrosséis · ${totais.imagens} imagens`} />
        <StatTile label="Janela" value={`${janela.dias} dias`} sub={`${fmtDate(janela.primeiro)} → ${fmtDate(janela.ultimo)}`} />
      </div>

      {ocultos > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {ocultos} publicação(ões) com curtidas ocultas pelo Instagram ficaram fora das médias — não
          entram como zero, pra não puxar o número pra baixo sem motivo.
        </p>
      )}

      <EngajamentoPorMes metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-2">
        <BarrasSimples
          title="Melhor dia da semana"
          hint="Engajamento médio das publicações feitas em cada dia"
          data={metrics.porDiaSemana}
          xKey="curto"
          xLabel="Dia"
        />
        <BarrasSimples
          title="Melhor horário"
          hint={`Faixa de publicação · fuso UTC${metrics.tzOffset >= 0 ? "+" : ""}${metrics.tzOffset}`}
          data={metrics.porFaixaHorario}
          xKey="faixa"
          xLabel="Faixa"
        />
        <MixDeFormato metrics={metrics} />
        <BarrasSimples
          title="Tamanho da legenda"
          hint={`Média de ${nf(legenda.mediaCaracteres)} caracteres · faixas são ordenadas, por isso a escala de tom`}
          data={legenda.buckets.map((b) => ({ ...b, faixa: b.faixa }))}
          xKey="faixa"
          xLabel="Caracteres"
          colors={VIZ_ORDINAL}
        />
        <TopHashtags metrics={metrics} />
      </div>

      <ChartCard
        title="Publicações que mais engajaram"
        hint="Múltiplo sobre a média do próprio perfil"
      >
        <div className="space-y-1.5">
          {metrics.topPosts.map((p) => {
            const mult = engajamento.media > 0 ? p.engajamento / engajamento.media : null;
            return (
              <a
                key={p.shortCode}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-lg border border-border/40 p-2.5 transition-colors hover:bg-muted/40"
              >
                <Badge variant="secondary" className="shrink-0 text-[10px]">{p.formato}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed">{p.caption || "(sem legenda)"}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {nf(p.likesCount)} curtidas · {nf(p.commentsCount)} comentários
                    {p.videoViewCount ? ` · ${nf(p.videoViewCount)} views` : ""} · {fmtDate(p.timestamp)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{nfCompact(p.engajamento)}</p>
                  {mult != null && (
                    <p className="text-[10px] tabular-nums text-muted-foreground">{mult.toFixed(1)}× média</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}

// ============================================================
// ANÁLISE
// ============================================================

function Bloco({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border/40 bg-card p-4 ${className}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function AnalysisView({
  analysis,
  focus,
}: {
  analysis: NonNullable<ScanDetail["analysis"]>;
  focus: string | null;
}) {
  const { nicho, publico_alvo, estrategia } = analysis;
  return (
    <div className="space-y-4">
      {/* A pergunta vem primeiro — é o que a pessoa foi buscar. */}
      {focus && analysis.resposta_ao_foco && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 flex items-start gap-2 text-sm font-medium">
            <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {focus}
          </p>
          <div className="space-y-2 pl-6">
            {analysis.resposta_ao_foco.split("\n\n").map((par, i) => (
              <p key={i} className="text-sm leading-relaxed">{par}</p>
            ))}
          </div>
        </section>
      )}

      <Bloco title="Resumo executivo">
        <div className="space-y-2">
          {analysis.resumo_executivo.split("\n\n").map((par, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">{par}</p>
          ))}
        </div>
      </Bloco>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco title="Nicho">
          <p className="text-sm font-medium">{nicho.principal}</p>
          {nicho.subnichos.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {nicho.subnichos.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{nicho.justificativa}</p>
        </Bloco>

        <Bloco title="Posicionamento">
          <p className="text-xs leading-relaxed text-muted-foreground">{analysis.posicionamento}</p>
        </Bloco>

        <Bloco title="Público-alvo" className="xl:col-span-2">
          <p className="text-xs leading-relaxed text-muted-foreground">{publico_alvo.descricao}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dores</p>
              <Lista items={publico_alvo.dores} />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Desejos</p>
              <Lista items={publico_alvo.desejos} />
            </div>
          </div>
        </Bloco>
      </div>

      <Bloco title="Pilares de conteúdo" hint="Peso estimado de cada tema no feed">
        <div className="grid gap-2 md:grid-cols-2">
          {analysis.pilares_conteudo.map((p) => (
            <div key={p.nome} className="rounded-lg border border-border/40 p-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{p.nome}</p>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{p.peso_estimado}%</span>
              </div>
              {/* Meter: trilha é um passo mais claro da própria rampa. */}
              <div className="mb-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--viz-ord-1)", opacity: 0.35 }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, p.peso_estimado)}%`, background: VIZ_SERIES_1 }}
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{p.descricao}</p>
              {p.exemplos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.exemplos.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
                      exemplo {i + 1} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco title="Estratégia">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {([
            ["Formato dominante", estrategia.formato_dominante],
            ["Estrutura narrativa", estrategia.estrutura_narrativa],
            ["CTA predominante", estrategia.cta_predominante],
            ["Tom de voz", estrategia.tom_de_voz],
            ["Hashtags", estrategia.uso_de_hashtags],
            ["Cadência", estrategia.cadencia],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border/40 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="mt-1 text-xs leading-relaxed">{v}</p>
            </div>
          ))}
        </div>
        {estrategia.padroes_de_gancho.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Padrões de gancho
            </p>
            <Lista items={estrategia.padroes_de_gancho} />
          </div>
        )}
      </Bloco>

      <Bloco
        title="O que ele ensina em cada vídeo"
        hint="Extraído das legendas — o áudio e a imagem do vídeo não são acessíveis pela API"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          {analysis.insights_conteudo.map((ins, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0 text-[10px]">{ins.formato}</Badge>
                <span className="truncate text-[11px] font-medium">{ins.tema}</span>
                <a href={ins.post_url} target="_blank" rel="noreferrer"
                  className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs leading-relaxed">{ins.insight}</p>
              <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Gancho:</span> {ins.gancho}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Por que performou:</span>{" "}
                  {ins.por_que_performou}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      <div className="grid gap-4 xl:grid-cols-3">
        <Bloco title="Teses centrais"><Lista items={analysis.teses_centrais} /></Bloco>
        <Bloco title="Pontos fortes"><Lista items={analysis.pontos_fortes} /></Bloco>
        <Bloco title="Oportunidades"><Lista items={analysis.oportunidades} /></Bloco>
      </div>

      <Bloco title="Playbook" hint="O que dá pra replicar dessa estratégia">
        <div className="grid gap-2 md:grid-cols-2">
          {analysis.playbook.map((p, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-3">
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.como_aplicar}</p>
            </div>
          ))}
        </div>
      </Bloco>
    </div>
  );
}

// ============================================================
// RELATÓRIO
// ============================================================

export function ScanReport({ scanId }: { scanId: string }) {
  const { data: scan, isLoading } = useInstagramScan(scanId);

  if (isLoading || !scan) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (scan.status === "queued" || scan.status === "running") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-16 text-center">
        {scan.status === "queued" ? (
          <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        ) : (
          <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
        )}
        <p className="text-base font-medium">
          {scan.status === "queued" ? "Na fila" : `Analisando @${scan.username}`}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          A coleta e a análise levam alguns minutos. Esta página se atualiza sozinha — pode deixar
          aberta ou fechar e voltar depois.
        </p>
        {scan.focus && (
          <p className="mx-auto mt-3 max-w-md text-xs italic text-muted-foreground">“{scan.focus}”</p>
        )}
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-10 text-center">
        <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-base font-medium">Não foi possível escanear @{scan.username}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{scan.error}</p>
      </div>
    );
  }

  const p = scan.profile;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do perfil */}
      <header className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">@{scan.username}</h1>
              {p?.verified && <BadgeCheck className="h-5 w-5 text-primary" aria-label="verificado" />}
              {p?.businessCategoryName && (
                <Badge variant="secondary" className="text-[10px]">{p.businessCategoryName}</Badge>
              )}
              <a
                href={p?.url ?? `https://instagram.com/${scan.username}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Instagram className="h-3.5 w-3.5" /> abrir perfil
              </a>
            </div>
            {p?.fullName && <p className="mt-0.5 text-sm text-muted-foreground">{p.fullName}</p>}
            {p?.biography && (
              <p className="mt-2 max-w-2xl whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {p.biography}
              </p>
            )}
          </div>

          <div className="flex gap-5">
            {([
              ["Seguidores", p?.followersCount],
              ["Seguindo", p?.followsCount],
              ["Publicações", p?.postsCount],
            ] as const).map(([label, v]) => (
              <div key={label}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="text-xl font-semibold leading-tight">{nfCompact(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {scan.error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          A análise qualitativa não foi concluída ({scan.error}). Os números abaixo são válidos.
        </p>
      )}

      {scan.analysis && <AnalysisView analysis={scan.analysis} focus={scan.focus} />}
      {scan.metrics && <MetricsView metrics={scan.metrics} />}

      {scan.usage && (
        <p className="text-[10px] text-muted-foreground">
          {scan.usage.model} · {nf(scan.usage.inputTokens)} tokens de entrada ·{" "}
          {nf(scan.usage.outputTokens)} de saída
        </p>
      )}
    </div>
  );
}
