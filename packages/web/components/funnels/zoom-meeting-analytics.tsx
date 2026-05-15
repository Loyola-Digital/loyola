"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ZoomParticipant, ZoomRawSession } from "@/lib/hooks/use-zoom-stage";

interface Props {
  participants: ZoomParticipant[];
  rawSessions?: ZoomRawSession[];
}

function fmtMin(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${(m % 60).toString().padStart(2, "0")}`;
  return `${m}min`;
}

/**
 * 4 gráficos sobre uma reunião:
 * 1. Curva de Retenção Temporal — % de pessoas ativas por minuto
 * 2. Audiência Simultânea — count absoluto por minuto (linha)
 * 3. Distribuição Hot/Warm/Cold/Bounce — donut
 * 4. Histograma de Duração — bar chart por buckets
 */
export function ZoomMeetingAnalytics({ participants, rawSessions }: Props) {
  // Tempo total da reunião = maior duração observada (proxy)
  const meetingDuration = useMemo(
    () => participants.reduce((max, p) => Math.max(max, p.durationSeconds), 0),
    [participants],
  );

  // ============================================================
  // 1 + 2: Curva de retenção e audiência simultânea (precisa rawSessions)
  // ============================================================
  const temporalData = useMemo(() => {
    if (!rawSessions || rawSessions.length === 0 || meetingDuration === 0) return null;

    // Encontra o tempo zero (start_time mais antigo) e o tempo final
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = 0;
    const sessionsAbs: { start: number; end: number }[] = [];
    for (const s of rawSessions) {
      const start = new Date(s.joinTime).getTime();
      const end = new Date(s.leaveTime).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        sessionsAbs.push({ start, end });
        if (start < minStart) minStart = start;
        if (end > maxEnd) maxEnd = end;
      }
    }
    if (sessionsAbs.length === 0) return null;

    const totalMs = maxEnd - minStart;
    const totalMinutes = Math.ceil(totalMs / 60000);
    if (totalMinutes <= 0) return null;

    // Bucket por minuto absoluto desde minStart. Pra cada minuto, conta sessões
    // ativas (start <= minute < end). Story 28.5: também guarda `clockTime` (HH:mm
    // do navegador) pra plotar no eixo X em vez de "minuto-desde-início".
    const points: { minute: number; clockTime: string; concurrent: number; retention: number }[] = [];
    const peakConcurrent = participants.length || 1;
    for (let m = 0; m <= Math.min(totalMinutes, 240); m++) {
      const t = minStart + m * 60000;
      let concurrent = 0;
      for (const sess of sessionsAbs) {
        if (sess.start <= t && t < sess.end) concurrent++;
      }
      const clockTime = new Date(t).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      points.push({
        minute: m,
        clockTime,
        concurrent,
        retention: peakConcurrent > 0 ? (concurrent / peakConcurrent) * 100 : 0,
      });
    }

    return points;
  }, [rawSessions, meetingDuration, participants.length]);

  // Story 28.5: interval pros XAxis distribui ~12 ticks no eixo evitando overlap.
  const temporalTickInterval = useMemo(
    () => (temporalData ? Math.max(0, Math.floor(temporalData.length / 12)) : 0),
    [temporalData],
  );

  // ============================================================
  // 3: Hot/Warm/Cold/Bounce (precisa só participants)
  // ============================================================
  const distributionData = useMemo(() => {
    if (!meetingDuration || participants.length === 0) return [];
    const buckets = { hot: 0, warm: 0, cold: 0, bounce: 0 };
    for (const p of participants) {
      const ret = (p.durationSeconds / meetingDuration) * 100;
      if (ret > 80) buckets.hot++;
      else if (ret > 50) buckets.warm++;
      else if (ret > 20) buckets.cold++;
      else buckets.bounce++;
    }
    return [
      { name: "Hot (>80%)", value: buckets.hot, fill: "#10b981" },
      { name: "Warm (50-80%)", value: buckets.warm, fill: "#f59e0b" },
      { name: "Cold (20-50%)", value: buckets.cold, fill: "#94a3b8" },
      { name: "Bounce (<20%)", value: buckets.bounce, fill: "#ef4444" },
    ].filter((b) => b.value > 0);
  }, [participants, meetingDuration]);

  // ============================================================
  // 4: Histograma de duração
  // ============================================================
  const histogramData = useMemo(() => {
    const buckets = [
      { name: "0-5min", min: 0, max: 5 * 60, count: 0 },
      { name: "5-15min", min: 5 * 60, max: 15 * 60, count: 0 },
      { name: "15-30min", min: 15 * 60, max: 30 * 60, count: 0 },
      { name: "30-60min", min: 30 * 60, max: 60 * 60, count: 0 },
      { name: "60-120min", min: 60 * 60, max: 120 * 60, count: 0 },
      { name: "120min+", min: 120 * 60, max: Infinity, count: 0 },
    ];
    for (const p of participants) {
      const bucket = buckets.find((b) => p.durationSeconds >= b.min && p.durationSeconds < b.max);
      if (bucket) bucket.count++;
    }
    return buckets.filter((b) => b.count > 0);
  }, [participants]);

  if (participants.length === 0) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Análise da Reunião
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. Curva de Retenção Temporal */}
          {temporalData && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-2">
                <h4 className="text-sm font-semibold">Curva de Retenção</h4>
                <p className="text-[11px] text-muted-foreground">% de pessoas ativas em cada minuto</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={temporalData}>
                  <defs>
                    <linearGradient id="retGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(210 90% 60%)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(210 90% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis
                    dataKey="clockTime"
                    interval={temporalTickInterval}
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 100]}
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    formatter={(v) => `${Number(v).toFixed(1)}%`}
                    labelFormatter={(label, payload) => {
                      const minute = payload?.[0]?.payload?.minute;
                      return minute !== undefined ? `${label} (min ${minute})` : String(label);
                    }}
                    contentStyle={{
                      fontSize: "11px",
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="retention"
                    stroke="hsl(210 90% 60%)"
                    fill="url(#retGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 2. Audiência Simultânea */}
          {temporalData && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-2">
                <h4 className="text-sm font-semibold">Audiência Simultânea</h4>
                <p className="text-[11px] text-muted-foreground">
                  Pico: {Math.max(...temporalData.map((p) => p.concurrent))} pessoas conectadas ao mesmo tempo
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={temporalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis
                    dataKey="clockTime"
                    interval={temporalTickInterval}
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    labelFormatter={(label, payload) => {
                      const minute = payload?.[0]?.payload?.minute;
                      return minute !== undefined ? `${label} (min ${minute})` : String(label);
                    }}
                    contentStyle={{
                      fontSize: "11px",
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="concurrent"
                    stroke="hsl(210 90% 60%)"
                    strokeWidth={2}
                    dot={false}
                    name="Pessoas online"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 3. Distribuição Hot/Warm/Cold/Bounce */}
          {distributionData.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-2">
                <h4 className="text-sm font-semibold">Distribuição de Engajamento</h4>
                <p className="text-[11px] text-muted-foreground">
                  Hot = ficou &gt;80% do tempo. Bounce = saiu rápido.
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={distributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={(entry) => {
                      const name = String(entry.name ?? "");
                      const percent = typeof entry.percent === "number" ? entry.percent : 0;
                      return `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`;
                    }}
                    labelLine={false}
                  >
                    {distributionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "11px" }} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 4. Histograma de Duração */}
          {histogramData.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-2">
                <h4 className="text-sm font-semibold">Distribuição por Tempo Assistido</h4>
                <p className="text-[11px] text-muted-foreground">
                  Quantas pessoas em cada faixa de duração
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={histogramData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    labelFormatter={(label) => `Faixa: ${label}`}
                    contentStyle={{
                      fontSize: "11px",
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="count" fill="hsl(210 90% 60%)" name="Pessoas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// helpers exported pra reuso futuro
export { fmtMin };
