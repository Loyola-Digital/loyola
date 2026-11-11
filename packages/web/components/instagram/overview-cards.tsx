"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, Eye,
  TrendingUp, Heart, Bookmark, Share2, Link2, ImageIcon,
} from "lucide-react";
import type { InstagramProfile, InsightEntry } from "@/lib/hooks/use-instagram";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import type { MetricFormula } from "@/lib/types/metric-formula";
import {
  alcancePorSeguidor,
  alcanceDoPeriodo,
  cliquesNaBio,
  interacoesDoPeriodo,
  seguidoresGanhosEPerdidos as getFollowsBreakdown,
  variacao,
} from "@/lib/utils/instagram-posts";
import {
  buildFollowersFormula,
  buildFollowersDeltaFormula,
  buildReachFormula,
  buildViewsFormula,
  buildInteractionsFormula,
  buildEngagementFormula,
  buildSavesFormula,
  buildSharesFormula,
  buildBioClicksFormula,
  buildProfileViewsFormula,
  type InstagramPeriod,
} from "@/lib/formulas/instagram";

interface OverviewCardsProps {
  profile?: InstagramProfile;
  insights?: InsightEntry[];
  isLoading: boolean;
  /** Período ativo do filtro — usado para compor o memorial de cada métrica. */
  period?: InstagramPeriod;
  /** Insights do período anterior (mesma duração, shift pra trás) — opcional.
   * Quando presente, habilita o card "Variação de Ganhos". */
  previousInsights?: InsightEntry[];
  /** Período anterior (compondo with previousInsights). */
  previousPeriod?: InstagramPeriod;
  /** Total de posts publicados dentro do período (calculado upstream a partir de media). */
  postsInPeriod?: number | null;
  /** True quando a janela de media puxada não cobre todo o período (count pode ser maior que postsInPeriod). */
  postsCountTruncated?: boolean;
}

/** Extract a numeric value from an insight entry — handles both time_series and total_value formats */
function getInsightValue(entries: InsightEntry[] | undefined, name: string): number {
  if (!entries) return 0;
  const entry = entries.find((e) => e.name === name);
  if (!entry) return 0;

  // total_value format (v25 — most metrics)
  if (entry.total_value) {
    const tv = entry.total_value.value;
    if (typeof tv === "number") return tv;
    if (typeof tv === "object" && tv !== null) {
      return Object.values(tv as Record<string, number>).reduce((s, n) => s + (typeof n === "number" ? n : 0), 0);
    }
  }

  // time_series format (v25 — only reach)
  if (Array.isArray(entry.values) && entry.values.length > 0) {
    return entry.values.reduce((sum, v) => sum + (typeof v.value === "number" ? v.value : 0), 0);
  }

  return 0;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number): string {
  return `${val.toFixed(2)}%`;
}

/**
 * Os números em quatro etapas, na ordem em que uma pessoa percorre o perfil.
 *
 * Treze cartões lado a lado não dizem por onde começar a ler. Separados por
 * etapa, dizem: se o problema está em 1, não adianta mexer em 3 — o conteúdo
 * ainda nem está chegando às pessoas.
 */
type Etapa = "alcance" | "interesse" | "acao" | "audiencia";

const ETAPAS: { chave: Etapa; n: number; nome: string; sub: string; cor: string }[] = [
  { chave: "alcance", n: 1, nome: "Alcance", sub: "quantas pessoas viram", cor: "bg-cyan-500" },
  { chave: "interesse", n: 2, nome: "Interesse", sub: "o que fizeram com o conteúdo", cor: "bg-purple-500" },
  { chave: "acao", n: 3, nome: "Ação", sub: "o que decidiram fazer", cor: "bg-amber-500" },
  { chave: "audiencia", n: 4, nome: "Audiência", sub: "quem acompanha a conta", cor: "bg-emerald-500" },
];

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  gradient?: string;
  border?: string;
  /**
   * Variação sobre o período anterior (mesma duração, logo antes). `pontos`
   * para taxa: "subiu 21%" de 4,2% para 5,1% se confundiria com a própria taxa.
   */
  delta?: { valor: number | null; pontos?: boolean };
}

/** "+18% vs anterior", com seta e cor — cor sozinha exclui quem não distingue verde de vermelho. */
function Delta({ valor, pontos }: { valor: number | null; pontos?: boolean }) {
  if (valor == null) {
    return <p className="text-[9px] text-muted-foreground/60 mt-0.5">sem base no período anterior</p>;
  }
  const arred = pontos ? Math.round(valor * 10) / 10 : Math.round(valor);
  const cor = arred > 0 ? "text-emerald-500" : arred < 0 ? "text-red-500" : "text-muted-foreground";
  const seta = arred > 0 ? "▲" : arred < 0 ? "▼" : "•";
  const n = pontos ? `${Math.abs(arred).toFixed(1).replace(".", ",")} pp` : `${Math.abs(arred)}%`;
  return (
    <p className={`text-[10px] font-medium tabular-nums mt-0.5 ${cor}`}>
      {seta} {arred > 0 ? "+" : arred < 0 ? "−" : ""}{n} <span className="font-normal text-muted-foreground">vs anterior</span>
    </p>
  );
}

const KpiCard = React.forwardRef<HTMLDivElement, KpiProps & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, sub, gradient = "from-card/80 to-card/40", border = "border-border/30", delta, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} {...rest} className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-3 hover:border-border/50 transition-colors ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {delta && <Delta valor={delta.valor} pontos={delta.pontos} />}
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
});

export function OverviewCards({ profile, insights, isLoading, period, previousInsights, previousPeriod, postsInPeriod, postsCountTruncated }: OverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const followers = profile?.followers_count ?? 0;

  // Follows/unfollows breakdown
  const followsData = getFollowsBreakdown(insights);
  const followersDelta = followsData ? followsData.gained - followsData.lost : 0;
  const hasFollowData = !!followsData && (followsData.gained > 0 || followsData.lost > 0);

  // Growth variation — compara período atual vs anterior
  const previousFollowsData = getFollowsBreakdown(previousInsights);
  const previousDelta = previousFollowsData ? previousFollowsData.gained - previousFollowsData.lost : null;
  const hasVariationData =
    hasFollowData &&
    previousDelta !== null &&
    !!period &&
    !!previousPeriod &&
    !(previousDelta === 0 && followersDelta !== 0); // caso "Novo" — sem % válida
  const variation = hasVariationData && previousDelta !== 0
    ? ((followersDelta - previousDelta) / Math.abs(previousDelta)) * 100
    : 0;

  // Core metrics
  //
  // Alcance é o valor ÚNICO do período (`reach_total`): somar a série diária
  // conta de novo quem apareceu em mais de um dia — 1.728.838 contra
  // 1.171.564 em 30 dias de @odanilogato, e o app mostra o único.
  const totalReach = alcanceDoPeriodo(insights);
  const totalViews = getInsightValue(insights, "views");
  const totalLikes = getInsightValue(insights, "likes");
  const totalComments = getInsightValue(insights, "comments");
  const totalSaves = getInsightValue(insights, "saves");
  const totalShares = getInsightValue(insights, "shares");
  // Soma das partes, e não `total_interactions`: a métrica agregada da Meta
  // devolve mais do que a soma (337.700 contra 264.524) e o app mostra a soma.
  const totalInteractions = interacoesDoPeriodo(insights);
  const bio = cliquesNaBio(
    getInsightValue(insights, "website_clicks"),
    getInsightValue(insights, "profile_links_taps"),
  );
  const bioClicks = bio.valor;
  const visitasAoPerfil = getInsightValue(insights, "profile_views");

  const engagementRate = totalReach > 0 ? (totalInteractions / totalReach) * 100 : 0;

  // Mesmas métricas no período anterior. Sem insights de lá, nenhum card mostra
  // variação — melhor que comparar contra um zero que é só dado faltando.
  const temAnterior = !!previousInsights && previousInsights.length > 0;
  const anterior = (nome: string) => (temAnterior ? getInsightValue(previousInsights, nome) : null);
  const reachAnterior = temAnterior ? alcanceDoPeriodo(previousInsights) : null;
  const interacoesAnterior = temAnterior ? interacoesDoPeriodo(previousInsights) : null;
  const engajamentoAnterior =
    reachAnterior && interacoesAnterior != null ? (interacoesAnterior / reachAnterior) * 100 : null;
  const deltaDe = (atual: number, nome: string) =>
    temAnterior ? { valor: variacao(atual, anterior(nome)) } : undefined;

  const porSeguidor = alcancePorSeguidor(insights);
  const porSeguidorAnterior = temAnterior ? alcancePorSeguidor(previousInsights) : null;

  interface CardDef {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    gradient?: string;
    border?: string;
    show: boolean;
    formula?: MetricFormula;
    delta?: { valor: number | null; pontos?: boolean };
    /** Em que etapa do caminho este número entra (ver ETAPAS). */
    etapa: Etapa;
  }

  /** Saídas sobre entradas: de cada 100 que entraram, quantos saíram. */
  const saidasSobreEntradas =
    followsData && followsData.gained > 0 ? (followsData.lost / followsData.gained) * 100 : null;
  const saidasAnterior =
    previousFollowsData && previousFollowsData.gained > 0
      ? (previousFollowsData.lost / previousFollowsData.gained) * 100
      : null;

  const cards: CardDef[] = [
    {
      icon: Users,
      label: "Seguidores",
      value: fmtNumber(followers),
      sub: "total de hoje — a Meta só informa o atual",
      gradient: "from-blue-500/10 to-blue-600/5",
      border: "border-blue-500/20",
      show: true,
      etapa: "audiencia" as Etapa,
      formula: buildFollowersFormula(profile?.followers_count),
    },
    {
      // O cartão de variação virou a seta deste: eram dois cartões para o
      // mesmo número, e o saldo sem "era quanto antes" não diz se melhorou.
      icon: followersDelta >= 0 ? UserPlus : UserMinus,
      label: "Saldo de seguidores",
      value: `${followersDelta >= 0 ? "+" : ""}${fmtNumber(followersDelta)}`,
      sub: followsData
        ? `+${fmtNumber(followsData.gained)} entraram · −${fmtNumber(followsData.lost)} saíram`
        : undefined,
      gradient: followersDelta >= 0 ? "from-emerald-500/10 to-emerald-600/5" : "from-red-500/10 to-red-600/5",
      border: followersDelta >= 0 ? "border-emerald-500/20" : "border-red-500/20",
      show: hasFollowData,
      etapa: "audiencia" as Etapa,
      delta: hasVariationData ? { valor: variation } : undefined,
      formula: followsData && period
        ? buildFollowersDeltaFormula(followsData.gained, followsData.lost, period)
        : undefined,
    },
    {
      icon: UserMinus,
      label: "Saídas sobre entradas",
      value: saidasSobreEntradas == null ? "—" : `${Math.round(saidasSobreEntradas)}%`,
      sub: "de cada 100 que entraram, quantos saíram — menor é melhor",
      gradient: "from-rose-500/10 to-rose-600/5",
      border: "border-rose-500/20",
      show: saidasSobreEntradas != null,
      etapa: "audiencia" as Etapa,
      // Cair é melhorar, então a seta tem de apontar ao contrário do número.
      delta:
        saidasSobreEntradas != null && saidasAnterior != null
          ? { valor: saidasAnterior - saidasSobreEntradas, pontos: true }
          : undefined,
      formula:
        followsData && saidasSobreEntradas != null
          ? {
              expression: "saíram ÷ entraram × 100",
              values: [
                { label: "Saíram no período", value: followsData.lost, source: "Instagram Graph API · follows_and_unfollows" },
                { label: "Entraram no período", value: followsData.gained, source: "Instagram Graph API · follows_and_unfollows" },
              ],
              result: `${Math.round(saidasSobreEntradas)}%`,
              note: "O saldo esconde um movimento grande nos dois sentidos: dá para ganhar 500 seguidores tendo perdido 2 mil. Esta é a conta que mostra quanto do que entrou foi embora.",
            }
          : undefined,
    },
    {
      icon: ImageIcon,
      label: "Posts publicados",
      value: postsInPeriod != null ? `${fmtNumber(postsInPeriod)}${postsCountTruncated ? "+" : ""}` : "—",
      sub: postsCountTruncated ? "limite de 100 posts atingido" : "publicados no período",
      gradient: "from-slate-500/10 to-slate-600/5",
      border: "border-slate-500/20",
      show: postsInPeriod != null,
      etapa: "audiencia" as Etapa,
    },
    {
      icon: Eye,
      label: "Alcance",
      etapa: "alcance" as Etapa,
      value: fmtNumber(totalReach),
      gradient: "from-cyan-500/10 to-cyan-600/5",
      border: "border-cyan-500/20",
      show: totalReach > 0,
      formula: period ? buildReachFormula(totalReach, period) : undefined,
      delta: temAnterior ? { valor: variacao(totalReach, reachAnterior) } : undefined,
    },
    {
      icon: Eye,
      label: "Visualizações",
      etapa: "alcance" as Etapa,
      value: fmtNumber(totalViews),
      gradient: "from-purple-500/10 to-purple-600/5",
      border: "border-purple-500/20",
      show: totalViews > 0,
      formula: period ? buildViewsFormula(totalViews, period) : undefined,
      delta: deltaDe(totalViews, "views"),
    },
    {
      icon: Users,
      label: "Não seguidores",
      etapa: "alcance" as Etapa,
      value: porSeguidor ? fmtPercent(porSeguidor.pctNaoSeguidores) : "—",
      sub: porSeguidor
        ? `do alcance · ${fmtNumber(porSeguidor.naoSeguidores)} não seguem · ${fmtNumber(porSeguidor.seguidores)} seguem`
        : undefined,
      gradient: "from-sky-500/10 to-sky-600/5",
      border: "border-sky-500/20",
      show: !!porSeguidor,
      delta: temAnterior && porSeguidor
        ? {
            valor: porSeguidorAnterior
              ? porSeguidor.pctNaoSeguidores - porSeguidorAnterior.pctNaoSeguidores
              : null,
            pontos: true,
          }
        : undefined,
      formula: porSeguidor
        ? {
            expression: "não seguidores ÷ (seguidores + não seguidores)",
            values: [
              { label: "Não seguidores alcançados", value: porSeguidor.naoSeguidores, source: "Instagram Graph API · reach (follow_type)" },
              { label: "Seguidores alcançados", value: porSeguidor.seguidores, source: "Instagram Graph API · reach (follow_type)" },
            ],
            result: fmtPercent(porSeguidor.pctNaoSeguidores),
            note: "Quanto do alcance do período veio de quem ainda não segue o perfil — é o público novo. A Meta só dá essa divisão para o perfil inteiro, não por post.",
          }
        : undefined,
    },
    {
      icon: Heart,
      label: "Interações",
      etapa: "interesse" as Etapa,
      value: fmtNumber(totalInteractions),
      sub: totalLikes > 0 ? `${fmtNumber(totalLikes)} likes · ${fmtNumber(totalComments)} comments` : undefined,
      gradient: "from-pink-500/10 to-pink-600/5",
      border: "border-pink-500/20",
      show: totalInteractions > 0,
      delta: temAnterior ? { valor: variacao(totalInteractions, interacoesAnterior) } : undefined,
      formula: period
        ? buildInteractionsFormula(totalInteractions, totalLikes, totalComments, period)
        : undefined,
    },
    {
      icon: TrendingUp,
      label: "Engajamento",
      etapa: "interesse" as Etapa,
      value: fmtPercent(engagementRate),
      sub: "interacoes / alcance",
      gradient: "from-amber-500/10 to-amber-600/5",
      border: "border-amber-500/20",
      show: engagementRate > 0,
      delta: temAnterior
        ? { valor: engajamentoAnterior == null ? null : engagementRate - engajamentoAnterior, pontos: true }
        : undefined,
      formula: period
        ? buildEngagementFormula(totalInteractions, totalReach, period)
        : undefined,
    },
    {
      icon: Bookmark,
      label: "Salvamentos",
      etapa: "interesse" as Etapa,
      value: fmtNumber(totalSaves),
      gradient: "from-indigo-500/10 to-indigo-600/5",
      border: "border-indigo-500/20",
      show: totalSaves > 0,
      formula: period ? buildSavesFormula(totalSaves, period) : undefined,
      delta: deltaDe(totalSaves, "saves"),
    },
    {
      icon: Share2,
      label: "Compartilhamentos",
      etapa: "interesse" as Etapa,
      value: fmtNumber(totalShares),
      gradient: "from-teal-500/10 to-teal-600/5",
      border: "border-teal-500/20",
      show: totalShares > 0,
      formula: period ? buildSharesFormula(totalShares, period) : undefined,
      delta: deltaDe(totalShares, "shares"),
    },
    {
      icon: Users,
      label: "Visitas ao perfil",
      etapa: "acao" as Etapa,
      value: fmtNumber(visitasAoPerfil),
      sub: "abriram o perfil no período",
      gradient: "from-violet-500/10 to-violet-600/5",
      border: "border-violet-500/20",
      show: visitasAoPerfil > 0,
      delta: deltaDe(visitasAoPerfil, "profile_views"),
      formula: period ? buildProfileViewsFormula(visitasAoPerfil, period) : undefined,
    },
    {
      icon: Link2,
      label: "Cliques na bio",
      etapa: "acao" as Etapa,
      value: fmtNumber(bioClicks),
      gradient: "from-orange-500/10 to-orange-600/5",
      border: "border-orange-500/20",
      show: bioClicks > 0,
      delta: temAnterior
        ? {
            valor: variacao(
              bioClicks,
              cliquesNaBio(
                anterior("website_clicks") ?? 0,
                anterior("profile_links_taps") ?? 0,
              ).valor,
            ),
          }
        : undefined,
      formula: period ? buildBioClicksFormula(bioClicks, period, bio.fonte) : undefined,
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-5">
      {ETAPAS.map((etapa) => {
        const doGrupo = cards.filter((c) => c.etapa === etapa.chave);
        if (doGrupo.length === 0) return null;
        return (
          <div key={etapa.chave} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${etapa.cor}`}
                aria-hidden="true"
              >
                {etapa.n}
              </span>
              {etapa.nome}
              <span className="text-xs font-normal text-muted-foreground">{etapa.sub}</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {doGrupo.map((c) => (
                <MetricTooltip key={c.label} label={c.label} value={c.value} formula={c.formula}>
                  <KpiCard icon={c.icon} label={c.label} value={c.value} sub={c.sub} gradient={c.gradient} border={c.border} delta={c.delta} />
                </MetricTooltip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
