import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { colors, fullScreen } from "../styles";
import { SidebarMock } from "../components/SidebarMock";
import { KpiCard } from "../components/KpiCard";
import { LineChart } from "../components/LineChart";
import { AnimatedBar } from "../components/AnimatedBar";

const reachData = [1200, 1450, 1380, 1620, 1890, 1750, 2100, 2340, 2180, 2560, 2890, 3100, 2950, 3200];
const labels = ["01", "03", "05", "07", "09", "11", "13", "15", "17", "19", "21", "23", "25", "27"];

export const InstagramScene: React.FC = () => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [350, 390], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "row", alignItems: "stretch", opacity: exitOpacity }}>
      <SidebarMock activeItem="instagram" />

      <div style={{ flex: 1, padding: "32px 40px", display: "flex", flexDirection: "column", gap: 24, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>📊</span> Instagram Analytics
            </h1>
            <p style={{ fontSize: 14, color: colors.textMuted, margin: "4px 0 0" }}>
              @loyoladigital · Últimos 30 dias
            </p>
          </div>
          <div
            style={{
              padding: "8px 20px",
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.bgCard,
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            📅 Últimos 30 dias
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "flex", gap: 16 }}>
          <KpiCard title="Seguidores" value="12.4K" change="+8.2%" positive delay={10} icon="👥" />
          <KpiCard title="Alcance" value="89.2K" change="+23.5%" positive delay={18} icon="📡" />
          <KpiCard title="Impressões" value="142K" change="+15.8%" positive delay={26} icon="👁️" />
          <KpiCard title="Engajamento" value="4.8%" change="+0.6%" positive delay={34} icon="❤️" />
        </div>

        {/* Charts row */}
        <div style={{ display: "flex", gap: 20 }}>
          {/* Reach chart */}
          <div
            style={{
              flex: 2,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <LineChart
              data={reachData}
              labels={labels}
              width={680}
              height={200}
              color={colors.brand}
              delay={40}
              title="Alcance Diário"
            />
          </div>

          {/* Audience breakdown */}
          <div
            style={{
              flex: 1,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 16 }}>
              Audiência por Idade
            </div>
            <AnimatedBar value={35} maxWidth={260} label="18-24" color={colors.blue} delay={60} showValue="35%" />
            <AnimatedBar value={45} maxWidth={260} label="25-34" color={colors.brand} delay={68} showValue="45%" />
            <AnimatedBar value={28} maxWidth={260} label="35-44" color={colors.green} delay={76} showValue="28%" />
            <AnimatedBar value={15} maxWidth={260} label="45-54" color={colors.purple} delay={84} showValue="15%" />
            <AnimatedBar value={8} maxWidth={260} label="55+" color={colors.orange} delay={92} showValue="8%" />
          </div>
        </div>

        {/* Posts table preview */}
        <div
          style={{
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: "16px 24px",
          }}
        >
          <div style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 12 }}>
            Top Posts
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { type: "Reel", reach: "12.4K", likes: "890", color: colors.purple },
              { type: "Carrossel", reach: "8.7K", likes: "654", color: colors.blue },
              { type: "Story", reach: "6.2K", likes: "432", color: colors.green },
              { type: "Post", reach: "5.1K", likes: "321", color: colors.orange },
            ].map((post, i) => {
              const postOpacity = interpolate(frame, [100 + i * 12, 120 + i * 12], [0, 1], {
                extrapolateRight: "clamp",
                extrapolateLeft: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 10,
                    backgroundColor: colors.surface,
                    opacity: postOpacity,
                  }}
                >
                  <div style={{ fontSize: 11, color: post.color, fontWeight: 600, marginBottom: 4 }}>
                    {post.type}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: colors.text }}>{post.reach}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>alcance · ❤️ {post.likes}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
