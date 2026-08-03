"use client";

/**
 * Spy de Conteúdo — o relatório de um perfil, em React nativo.
 *
 * Substitui o HTML autocontido que o CLI gerava: aqui herda o design system e o
 * tema do app, e os dados ficam em JSONB (dá pra comparar perfis depois sem
 * re-scrapar).
 *
 * Todo número vem de `metrics` (calculado em código no backend); `analysis` é a
 * leitura qualitativa da Claude. A separação é o que impede número alucinado.
 */

import { useState } from "react";
import {
  Loader2, Clock, XCircle, ExternalLink, TrendingUp, Users, Repeat,
  MessageCircle, Heart, Play, AlertTriangle, ChevronDown,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useInstagramScan, type ScanDetail, type ScanMetrics } from "@/lib/hooks/use-instagram-scans";

const int = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-border/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </div>
      <p className="text-xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Gráfico de barras + "ver dados em tabela" — mesma dupla do relatório do CLI. */
function BarBlock({
  data,
  xKey,
  barKey,
  barLabel,
  countKey,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  barKey: string;
  barLabel: string;
  countKey?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  if (!data.length) {
    return <p className="text-xs text-muted-foreground">Sem dados suficientes.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/30" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" width={44} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v) => [int(typeof v === "number" ? v : null), barLabel]}
            />
            <Bar dataKey={barKey} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--primary))" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showTable ? "rotate-180" : ""}`} />
        Ver dados em tabela
      </button>
      {showTable && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{xKey}</th>
                {countKey && <th className="px-2 py-1.5 text-right font-medium">Posts</th>}
                <th className="px-2 py-1.5 text-right font-medium">{barLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="px-2 py-1.5">{String(row[xKey])}</td>
                  {countKey && (
                    <td className="px-2 py-1.5 text-right tabular-nums">{int(row[countKey] as number)}</td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums">{int(row[barKey] as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricsView({ metrics }: { metrics: ScanMetrics }) {
  const { engajamento, reels, totais, frequencia, janela, legenda } = metrics;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Kpi
          label="Engajamento médio"
          value={int(engajamento.media)}
          sub={`mediana ${int(engajamento.mediana)}`}
          icon={TrendingUp}
        />
        <Kpi
          label="Taxa / seguidor"
          value={pct(engajamento.taxaPorSeguidor)}
          sub="engajamento ÷ base"
          icon={Users}
        />
        <Kpi label="Curtidas médias" value={int(engajamento.mediaCurtidas)} icon={Heart} />
        <Kpi
          label="Comentários médios"
          value={int(engajamento.mediaComentarios)}
          sub={engajamento.razaoComentarioCurtida != null ? `${pct(engajamento.razaoComentarioCurtida)} das curtidas` : undefined}
          icon={MessageCircle}
        />
        <Kpi
          label="Cadência"
          value={`${frequencia.porSemana}/sem`}
          sub={frequencia.intervaloMedioDias != null ? `a cada ${frequencia.intervaloMedioDias} dias` : undefined}
          icon={Repeat}
        />
        <Kpi
          label="Views médias (Reels)"
          value={int(reels.mediaViews)}
          sub={reels.alcanceVsSeguidores != null ? `${reels.alcanceVsSeguidores}× a base` : "não informado"}
          icon={Play}
        />
        <Kpi
          label="Publicações"
          value={int(totais.analisados)}
          sub={`${totais.reels} reels · ${totais.carrosseis} carrosséis · ${totais.imagens} imagens`}
        />
        <Kpi
          label="Janela"
          value={`${janela.dias}d`}
          sub={`${fmtDate(janela.primeiro)} → ${fmtDate(janela.ultimo)}`}
        />
      </div>

      {totais.comEngajamentoVisivel < totais.analisados && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {totais.analisados - totais.comEngajamentoVisivel} publicação(ões) com curtidas ocultas pelo
          Instagram ficaram fora das médias.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Engajamento por mês">
          <BarBlock data={metrics.porMes} xKey="mes" barKey="engajamentoMedio" barLabel="Engajamento" countKey="posts" />
        </Section>
        <Section title="Engajamento por dia da semana">
          <BarBlock data={metrics.porDiaSemana} xKey="curto" barKey="engajamentoMedio" barLabel="Engajamento" countKey="posts" />
        </Section>
        <Section title="Engajamento por horário" hint={`Fuso UTC${metrics.tzOffset >= 0 ? "+" : ""}${metrics.tzOffset}`}>
          <BarBlock data={metrics.porFaixaHorario} xKey="faixa" barKey="engajamentoMedio" barLabel="Engajamento" countKey="posts" />
        </Section>
        <Section title="Formato" hint="Share do feed e engajamento médio de cada tipo">
          <BarBlock data={metrics.formatos} xKey="formato" barKey="engajamentoMedio" barLabel="Engajamento" countKey="posts" />
        </Section>
        <Section title="Tamanho da legenda" hint={`Média ${int(legenda.mediaCaracteres)} caracteres`}>
          <BarBlock data={legenda.buckets} xKey="faixa" barKey="engajamentoMedio" barLabel="Engajamento" countKey="posts" />
        </Section>
        <Section title="Top hashtags">
          {metrics.hashtags.length === 0 ? (
            <p className="text-xs text-muted-foreground">O perfil não usa hashtags.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {metrics.hashtags.map((h) => (
                <span
                  key={h.tag}
                  className="rounded-full border border-border/50 px-2 py-0.5 text-[11px]"
                  title={`${h.usos} usos · engajamento médio ${int(h.engajamentoMedio)}`}
                >
                  #{h.tag} <span className="text-muted-foreground">{h.usos}</span>
                </span>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Publicações que mais engajaram">
        <div className="space-y-1.5">
          {metrics.topPosts.map((p) => {
            const mult = engajamento.media > 0 ? p.engajamento / engajamento.media : null;
            return (
              <a
                key={p.shortCode}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-lg border border-border/40 p-2.5 hover:bg-muted/40"
              >
                <Badge variant="secondary" className="shrink-0 text-[10px]">{p.formato}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs">{p.caption || "(sem legenda)"}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {int(p.likesCount)} curtidas · {int(p.commentsCount)} comentários
                    {p.videoViewCount ? ` · ${int(p.videoViewCount)} views` : ""} · {fmtDate(p.timestamp)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-emerald-500">{int(p.engajamento)}</p>
                  {mult != null && (
                    <p className="text-[10px] text-muted-foreground">{mult.toFixed(1)}× a média</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: NonNullable<ScanDetail["analysis"]> }) {
  const { nicho, publico_alvo, estrategia } = analysis;
  return (
    <div className="space-y-6">
      <Section title="Resumo executivo">
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {analysis.resumo_executivo}
        </p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Nicho">
          <p className="text-sm font-medium">{nicho.principal}</p>
          {nicho.subnichos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {nicho.subnichos.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{nicho.justificativa}</p>
        </Section>

        <Section title="Posicionamento">
          <p className="text-xs text-muted-foreground">{analysis.posicionamento}</p>
        </Section>

        <Section title="Público-alvo">
          <p className="text-xs text-muted-foreground">{publico_alvo.descricao}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dores</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {publico_alvo.dores.map((d, i) => <li key={i}>• {d}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Desejos</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {publico_alvo.desejos.map((d, i) => <li key={i}>• {d}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Estratégia">
          <dl className="space-y-1.5 text-xs">
            {([
              ["Formato dominante", estrategia.formato_dominante],
              ["Estrutura narrativa", estrategia.estrutura_narrativa],
              ["CTA predominante", estrategia.cta_predominante],
              ["Tom de voz", estrategia.tom_de_voz],
              ["Hashtags", estrategia.uso_de_hashtags],
              ["Cadência", estrategia.cadencia],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <Section title="Pilares de conteúdo" hint="Peso estimado de cada tema no feed">
        <div className="space-y-2">
          {analysis.pilares_conteudo.map((p) => (
            <div key={p.nome} className="rounded-lg border border-border/40 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{p.nome}</p>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">{p.peso_estimado}%</span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p.peso_estimado)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{p.descricao}</p>
              {p.exemplos.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.exemplos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
                      exemplo <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="O que ele ensina em cada vídeo"
        hint="Insights extraídos das legendas — o áudio e a imagem do vídeo não são acessíveis"
      >
        <div className="space-y-2">
          {analysis.insights_conteudo.map((ins, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{ins.formato}</Badge>
                <span className="truncate text-[11px] font-medium">{ins.tema}</span>
                <a href={ins.post_url} target="_blank" rel="noreferrer"
                  className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs">{ins.insight}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium">Gancho:</span> {ins.gancho}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium">Por que performou:</span> {ins.por_que_performou}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Teses centrais">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {analysis.teses_centrais.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </Section>
        <Section title="Pontos fortes">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {analysis.pontos_fortes.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </Section>
        <Section title="Oportunidades">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {analysis.oportunidades.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </Section>
      </div>

      <Section title="Playbook" hint="O que dá pra replicar dessa estratégia">
        <div className="space-y-2">
          {analysis.playbook.map((p, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-3">
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.como_aplicar}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function ScanReport({ scanId }: { scanId: string }) {
  const { data: scan, isLoading } = useInstagramScan(scanId);

  if (isLoading || !scan) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (scan.status === "queued" || scan.status === "running") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-2">
        {scan.status === "queued" ? (
          <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
        ) : (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-500" />
        )}
        <p className="text-sm font-medium">
          {scan.status === "queued" ? "Na fila" : `Analisando @${scan.username}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Coleta + análise levam alguns minutos. Pode fechar a página — o resultado fica salvo aqui.
        </p>
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-8 text-center space-y-2">
        <XCircle className="mx-auto h-8 w-8 text-red-400" />
        <p className="text-sm font-medium">Não foi possível escanear @{scan.username}</p>
        <p className="text-xs text-muted-foreground">{scan.error}</p>
      </div>
    );
  }

  const p = scan.profile;

  return (
    <div className="space-y-6">
      {/* Cabeçalho do perfil */}
      <div className="flex items-start gap-3 rounded-xl border border-border/40 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold">@{scan.username}</h2>
            {p?.verified && <Badge variant="secondary" className="text-[10px]">verificado</Badge>}
            {p?.businessCategoryName && (
              <Badge variant="secondary" className="text-[10px]">{p.businessCategoryName}</Badge>
            )}
            <a href={p?.url ?? `https://instagram.com/${scan.username}`} target="_blank" rel="noreferrer"
              className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {p?.fullName && <p className="text-sm text-muted-foreground">{p.fullName}</p>}
          {p?.biography && (
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{p.biography}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span><strong className="tabular-nums">{int(p?.followersCount)}</strong> seguidores</span>
            <span><strong className="tabular-nums">{int(p?.followsCount)}</strong> seguindo</span>
            <span><strong className="tabular-nums">{int(p?.postsCount)}</strong> publicações</span>
          </div>
        </div>
      </div>

      {/* Análise falhou mas as métricas ficaram: mostra os números e avisa. */}
      {scan.error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          A análise qualitativa não foi concluída ({scan.error}). Os números abaixo são válidos.
        </p>
      )}

      {scan.metrics && <MetricsView metrics={scan.metrics} />}
      {scan.analysis && <AnalysisView analysis={scan.analysis} />}

      {scan.usage && (
        <p className="text-[10px] text-muted-foreground">
          {scan.usage.model} · {int(scan.usage.inputTokens)} tokens de entrada ·{" "}
          {int(scan.usage.outputTokens)} de saída
        </p>
      )}
    </div>
  );
}
