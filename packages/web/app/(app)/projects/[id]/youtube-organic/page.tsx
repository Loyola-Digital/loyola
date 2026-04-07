"use client";

import { use, useState } from "react";
import {
  Youtube, Eye, Clock, Users, ThumbsUp, MessageSquare, Share2, Settings,
  DollarSign,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import {
  useYouTubeChannels, useYouTubeOverview, useYouTubeDaily, useYouTubeVideos,
} from "@/lib/hooks/use-youtube-channels";

interface Props { params: Promise<{ id: string }>; }

function fmtNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(1)}%`;
}

const PERIOD_OPTIONS = [
  { label: "7 dias", value: 7 }, { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 }, { label: "90 dias", value: 90 },
];

function KpiCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export default function ProjectYouTubeOrganicPage({ params }: Props) {
  const { id: projectId } = use(params);
  const [days, setDays] = useState(30);
  const [isCustom, setIsCustom] = useState(false);
  const [customDays, setCustomDays] = useState("");

  const { data: channels } = useYouTubeChannels();
  const linkedChannel = channels?.find((ch) => ch.projects.some((p) => p.projectId === projectId));
  const channelDbId = linkedChannel?.id ?? null;

  const { data: overview, isLoading: overviewLoading } = useYouTubeOverview(channelDbId, days > 0 ? days : 30);
  const { data: dailyData, isLoading: dailyLoading } = useYouTubeDaily(channelDbId, days > 0 ? days : 30);
  const { data: videosData, isLoading: videosLoading } = useYouTubeVideos(channelDbId, 12);

  if (!linkedChannel && channels) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Youtube className="h-8 w-8 text-red-500" /></div>
        <p className="font-semibold text-lg">Nenhum canal YouTube vinculado</p>
        <p className="text-sm text-muted-foreground">Conecte um canal em Settings e vincule a este projeto.</p>
        <Button asChild><Link href="/settings/youtube"><Settings className="h-4 w-4" />Ir para Settings</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold flex items-center gap-2"><Youtube className="h-5 w-5 text-red-500" />YouTube</h1>
          {linkedChannel && (
            <div className="flex items-center gap-2">
              {linkedChannel.thumbnailUrl && <img src={linkedChannel.thumbnailUrl} alt="" className="h-6 w-6 rounded-full" />}
              <span className="text-sm text-muted-foreground">{linkedChannel.channelName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={isCustom ? "custom" : String(days)} onValueChange={(v) => { if (v === "custom") { setIsCustom(true); setCustomDays(""); } else { setIsCustom(false); setDays(Number(v)); } }}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={365} autoFocus value={customDays} onChange={(e) => { setCustomDays(e.target.value); const v = parseInt(e.target.value); if (v > 0 && v <= 365) setDays(v); }} placeholder="Dias" className="w-[70px] h-8 rounded-md border border-border bg-card px-2 text-xs" />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : overview ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard icon={Eye} label="Views" value={fmtNumber(overview.totalViews)} />
          <KpiCard icon={Clock} label="Watch Time" value={`${fmtNumber(overview.watchTimeHours)}h`} />
          <KpiCard icon={Users} label="Inscritos" value={`+${fmtNumber(overview.netSubscribers)}`} />
          <KpiCard icon={ThumbsUp} label="Likes" value={fmtNumber(overview.totalLikes)} />
          <KpiCard icon={MessageSquare} label="Comentarios" value={fmtNumber(overview.totalComments)} />
          <KpiCard icon={Share2} label="Shares" value={fmtNumber(overview.totalShares)} />
          <KpiCard icon={DollarSign} label="Retencao" value={fmtPercent(overview.avgRetention)} />
          <KpiCard icon={Users} label="Perdidos" value={fmtNumber(overview.subscribersLost)} />
        </div>
      ) : null}

      {/* Daily chart */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">Views & Inscritos Diarios</h3>
        {dailyLoading ? <Skeleton className="h-56" /> : dailyData && dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData.map((d) => ({ date: d.date.slice(5, 10), views: d.views, subs: d.subscribersGained }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="views" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="subs" orientation="right" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
              <Legend wrapperStyle={{ color: "#fff" }} />
              <Line yAxisId="views" type="monotone" dataKey="views" stroke="hsl(0 72% 55%)" strokeWidth={2} dot={false} name="Views" />
              <Line yAxisId="subs" type="monotone" dataKey="subs" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={false} name="Inscritos" />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="py-8 text-center text-sm text-muted-foreground">Sem dados no periodo.</div>}
      </div>

      {/* Top Videos */}
      {videosLoading ? <Skeleton className="h-64 rounded-xl" /> : videosData?.videos && videosData.videos.length > 0 ? (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold">Videos Recentes</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {videosData.videos.map((v) => (
              <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md">
                <div className="relative aspect-video"><img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" /></div>
                <div className="p-2.5 space-y-1">
                  <p className="text-[11px] font-medium line-clamp-2">{v.title}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{fmtNumber(v.viewCount)} views</span>
                    <span>{fmtNumber(v.likeCount)} likes</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
