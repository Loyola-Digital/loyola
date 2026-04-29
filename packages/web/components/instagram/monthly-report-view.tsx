"use client";

import { useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, Users, Eye, Heart, FileText,
  Image as ImageIcon, Film, MapPin, Globe, Share2, ExternalLink,
  Trophy, AlertTriangle, Copy as CopyIcon,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AccountReport,
  AccountReportDeltaItem,
  MonthlyReportData,
  PostSummary,
} from "@loyola-x/shared";

interface MonthlyReportViewProps {
  data: MonthlyReportData;
  generatedByName?: string;
}

function fmtNumber(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("pt-BR");
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtSigned(v: number): string {
  return v >= 0 ? `+${v.toLocaleString("pt-BR")}` : v.toLocaleString("pt-BR");
}

// ============================================================
// MAIN VIEW
// ============================================================

export function MonthlyReportView({ data, generatedByName }: MonthlyReportViewProps) {
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    data.accounts[0]?.accountId ?? null,
  );

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado!");
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/30 pb-4">
        <div>
          <h1 className="text-2xl font-bold">Relatório Instagram — {data.monthLabel}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Período {data.periodStart} a {data.periodEnd}
            {generatedByName ? ` · Gerado por ${generatedByName}` : ""}
            {" · "}{format(parseISO(data.generatedAt), "dd/MM/yy HH:mm")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5 print:hidden">
          <CopyIcon className="h-3.5 w-3.5" />
          Copiar link
        </Button>
      </div>

      {/* Account tabs (se >1) */}
      {data.accounts.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {data.accounts.map((acc) => (
            <button
              key={acc.accountId}
              type="button"
              onClick={() => setActiveAccountId(acc.accountId)}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                activeAccountId === acc.accountId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/30 hover:bg-muted/50"
              }`}
            >
              {acc.profilePictureUrl && (
                <img src={acc.profilePictureUrl} alt="" className="h-4 w-4 rounded-full" />
              )}
              @{acc.instagramUsername}
            </button>
          ))}
        </div>
      )}

      {/* Account sections */}
      {data.accounts.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma conta IG vinculada ou nenhum dado no período.
        </div>
      ) : (
        data.accounts
          .filter((acc) => data.accounts.length === 1 || acc.accountId === activeAccountId)
          .map((acc) => <AccountSection key={acc.accountId} account={acc} />)
      )}
    </div>
  );
}

// ============================================================
// ACCOUNT SECTION
// ============================================================

function AccountSection({ account }: { account: AccountReport }) {
  const hasNoPosts = account.totals.postsPublished === 0;

  return (
    <div className="space-y-6 print:break-before-page">
      {/* Identity card */}
      <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/60 p-4">
        {account.profilePictureUrl ? (
          <img src={account.profilePictureUrl} alt="" className="h-12 w-12 rounded-full" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted" />
        )}
        <div>
          <p className="font-semibold">@{account.instagramUsername}</p>
          {account.accountName !== account.instagramUsername && (
            <p className="text-xs text-muted-foreground">{account.accountName}</p>
          )}
        </div>
      </div>

      {hasNoPosts ? (
        <div className="rounded-lg border border-dashed border-border/40 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          Sem publicações no período.
        </div>
      ) : (
        <>
          {/* Totals grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={FileText}
              label="Posts publicados"
              value={fmtNumber(account.totals.postsPublished)}
              delta={account.comparison?.postsPublished}
            />
            <MetricCard
              icon={Eye}
              label="Alcance"
              value={fmtNumber(account.totals.reach)}
              delta={account.comparison?.reach}
            />
            <MetricCard
              icon={Eye}
              label="Visualizações"
              value={fmtNumber(account.totals.views)}
              delta={account.comparison?.views}
            />
            <MetricCard
              icon={Heart}
              label="Interações"
              value={fmtNumber(account.totals.interactions)}
              sub={`${fmtNumber(account.totals.likes)} likes · ${fmtNumber(account.totals.comments)} coments · ${fmtNumber(account.totals.saves)} saves`}
              delta={account.comparison?.interactions}
            />
          </div>

          {/* Followers balance */}
          <FollowersBalanceCard followers={account.followers} delta={account.comparison?.followersNet} />

          {/* Distribution + Daily trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MediaDistributionCard distribution={account.mediaDistribution} />
            <DailyTrendCard daily={account.dailyTrend} />
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankingList
              title="Top 5 — Engajamento"
              icon={Trophy}
              tone="positive"
              posts={account.topByEngagement}
              primaryMetric="engagement"
            />
            <RankingList
              title="Top 5 — Alcance"
              icon={Trophy}
              tone="positive"
              posts={account.topByReach}
              primaryMetric="reach"
            />
            <RankingList
              title="Bottom 5 — Engajamento"
              icon={AlertTriangle}
              tone="warning"
              posts={account.bottomByEngagement}
              primaryMetric="engagement"
            />
            <RankingList
              title="Bottom 5 — Alcance"
              icon={AlertTriangle}
              tone="warning"
              posts={account.bottomByReach}
              primaryMetric="reach"
            />
          </div>

          {/* Demographics */}
          <DemographicsSection demographics={account.demographics} />
        </>
      )}
    </div>
  );
}

// ============================================================
// METRIC CARD with delta
// ============================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  delta?: AccountReportDeltaItem;
}) {
  const deltaPct = delta?.deltaPct;
  const deltaIcon = deltaPct == null ? Minus : deltaPct > 0 ? TrendingUp : deltaPct < 0 ? TrendingDown : Minus;
  const DeltaIcon = deltaIcon;
  const deltaColor =
    deltaPct == null ? "text-muted-foreground"
      : deltaPct > 1 ? "text-emerald-600"
      : deltaPct < -1 ? "text-red-600"
      : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{sub}</p>}
      {delta && (
        <div className={`flex items-center gap-1 text-[10px] font-medium mt-1 ${deltaColor}`}>
          <DeltaIcon className="h-3 w-3" />
          {fmtPct(deltaPct)} <span className="text-muted-foreground">vs mês anterior</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FOLLOWERS BALANCE
// ============================================================

function FollowersBalanceCard({
  followers,
  delta,
}: {
  followers: AccountReport["followers"];
  delta?: AccountReportDeltaItem;
}) {
  const netColor = followers.net >= 0 ? "text-emerald-600" : "text-red-600";
  const deltaPct = delta?.deltaPct;

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Saldo de Seguidores
          </span>
          <p className={`text-3xl font-bold tracking-tight mt-1 ${netColor}`}>
            {fmtSigned(followers.net)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            +{fmtNumber(followers.gained)} novos · −{fmtNumber(followers.lost)} unfollows
          </p>
        </div>
        <div className="text-right">
          {followers.endOfMonth != null && (
            <p className="text-xs text-muted-foreground">
              Total ao fim do mês: <span className="font-semibold text-foreground">{fmtNumber(followers.endOfMonth)}</span>
            </p>
          )}
          {delta && deltaPct != null && (
            <p className={`text-xs font-medium mt-1 ${deltaPct > 1 ? "text-emerald-600" : deltaPct < -1 ? "text-red-600" : "text-muted-foreground"}`}>
              {fmtPct(deltaPct)} vs mês anterior
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MEDIA DISTRIBUTION
// ============================================================

function MediaDistributionCard({
  distribution,
}: {
  distribution: AccountReport["mediaDistribution"];
}) {
  const total = distribution.reels.count + distribution.feed.count;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-4">
        <h3 className="text-sm font-semibold mb-3">Distribuição por tipo</h3>
        <p className="text-xs text-muted-foreground">Sem publicações no período.</p>
      </div>
    );
  }

  const reelsPct = total > 0 ? (distribution.reels.count / total) * 100 : 0;
  const feedPct = total > 0 ? (distribution.feed.count / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Distribuição por tipo</h3>

      <div className="space-y-2">
        <DistRow
          icon={Film}
          label="Reels"
          count={distribution.reels.count}
          reach={distribution.reels.reach}
          pct={reelsPct}
          color="bg-rose-500"
        />
        <DistRow
          icon={ImageIcon}
          label="FEED (foto/carrossel)"
          count={distribution.feed.count}
          reach={distribution.feed.reach}
          pct={feedPct}
          color="bg-cyan-500"
        />
      </div>
    </div>
  );
}

function DistRow({
  icon: Icon,
  label,
  count,
  reach,
  pct,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  reach: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {count} posts · {fmtNumber(reach)} alcance · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============================================================
// DAILY TREND
// ============================================================

function DailyTrendCard({ daily }: { daily: AccountReport["dailyTrend"] }) {
  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-4">
        <h3 className="text-sm font-semibold mb-3">Alcance diário</h3>
        <p className="text-xs text-muted-foreground">Sem dados diários no período.</p>
      </div>
    );
  }

  const chartData = daily.map((d) => ({
    date: d.date.slice(5),
    reach: d.reach,
    followers: d.followersDelta,
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4">
      <h3 className="text-sm font-semibold mb-3">Alcance diário</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
          <Legend wrapperStyle={{ fontSize: "10px" }} />
          <Line type="monotone" dataKey="reach" stroke="hsl(190 80% 50%)" strokeWidth={2} dot={false} name="Alcance" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// RANKING LIST
// ============================================================

function RankingList({
  title,
  icon: Icon,
  tone,
  posts,
  primaryMetric,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "positive" | "warning";
  posts: PostSummary[];
  primaryMetric: "engagement" | "reach";
}) {
  const headerColor = tone === "positive" ? "text-emerald-600" : "text-amber-600";

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-2">
      <h3 className={`text-sm font-semibold flex items-center gap-2 ${headerColor}`}>
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Sem dados.</p>
      ) : (
        <div className="space-y-1.5">
          {posts.map((post, i) => {
            const externalUrl = post.permalink ?? `https://www.instagram.com/p/${post.mediaId}/`;
            const captionPreview = post.caption ?? "Sem legenda";
            const truncated = captionPreview.length > 70 ? captionPreview.slice(0, 67) + "..." : captionPreview;
            const primaryValue =
              primaryMetric === "engagement"
                ? `${(post.engagementRate ?? 0).toFixed(2)}%`
                : fmtNumber(post.reach);
            return (
              <a
                key={post.mediaId}
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border/20 bg-muted/10 p-2 hover:border-border/50 transition-colors group"
              >
                <span className="w-4 text-center text-xs font-bold text-muted-foreground tabular-nums shrink-0">
                  {i + 1}
                </span>
                <div className="relative h-9 w-9 rounded overflow-hidden bg-muted shrink-0">
                  {post.thumbnailUrl && (
                    <img src={post.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] line-clamp-1">{truncated}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {format(parseISO(post.timestamp), "dd/MM")}
                    {post.mediaProductType ? ` · ${post.mediaProductType}` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground shrink-0">
                  {primaryValue}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DEMOGRAPHICS
// ============================================================

function DemographicsSection({ demographics }: { demographics: AccountReport["demographics"] }) {
  if (!demographics) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-4 text-center text-xs text-muted-foreground">
        Demografia indisponível (conta com menos de 100 seguidores ou Meta não retornou).
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Age × Gender */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Idade × Gênero
        </h3>
        {demographics.ageGender && demographics.ageGender.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {demographics.ageGender.slice(0, 8).map((d, i) => (
              <li key={`${d.key}-${i}`} className="flex justify-between tabular-nums">
                <span className="text-muted-foreground">{d.key}</span>
                <span>{fmtNumber(d.value)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        )}
      </div>

      {/* Cidades */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Top 5 Cidades
        </h3>
        {demographics.cities && demographics.cities.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {demographics.cities.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex justify-between tabular-nums">
                <span className="text-muted-foreground line-clamp-1">{c.name}</span>
                <span>{fmtNumber(c.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        )}
      </div>

      {/* Países */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Top 5 Países
        </h3>
        {demographics.countries && demographics.countries.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {demographics.countries.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex justify-between tabular-nums">
                <span className="text-muted-foreground line-clamp-1">{c.name}</span>
                <span>{fmtNumber(c.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

export function MonthlyReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16" />
      <Skeleton className="h-24" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
      </div>
    </div>
  );
}

// silenced unused — kept for future use
void Share2;
