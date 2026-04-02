import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from "remotion";
import { colors, fullScreen, glassMorphism } from "../styles";
import { SidebarMock } from "../components/SidebarMock";
import { KpiCard } from "../components/KpiCard";

const stages = [
  { name: "Impressões", value: 142000, display: "142K", width: 100, color: colors.blue },
  { name: "Cliques", value: 18200, display: "18.2K", width: 82, color: colors.cyan },
  { name: "Leads", value: 4800, display: "4.8K", width: 58, color: colors.brand },
  { name: "Oportunidades", value: 1200, display: "1.2K", width: 38, color: colors.orange },
  { name: "Vendas", value: 340, display: "340", width: 22, color: colors.green },
];

export const FunnelScene: React.FC = () => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [290, 330], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "row", alignItems: "stretch", opacity: exitOpacity }}>
      <SidebarMock activeItem="funnel" />

      <div style={{ flex: 1, padding: "32px 40px", display: "flex", flexDirection: "column", gap: 24, overflow: "hidden" }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>🎯</span> Funil de Conversão
          </h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: "4px 0 0" }}>
            Lançamento SaaS Q1 2026 · Campanha Perpétua
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 16 }}>
          <KpiCard title="Taxa Conversão" value="0.24%" change="+0.08%" positive delay={8} icon="📊" />
          <KpiCard title="Custo/Venda" value="R$35.60" change="-18%" positive delay={16} icon="💰" />
          <KpiCard title="LTV Médio" value="R$2.364" change="+12%" positive delay={24} icon="💎" />
          <KpiCard title="Ticket Médio" value="R$197" icon="🎟️" delay={32} />
        </div>

        <div style={{ display: "flex", gap: 24, flex: 1 }}>
          {/* Funnel visualization */}
          <div
            style={{
              flex: 2,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "32px 40px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {stages.map((stage, i) => {
              const stageSpring = spring({
                frame: Math.max(0, frame - 40 - i * 18),
                fps: 60,
                config: { damping: 12, stiffness: 80, mass: 0.6 },
              });
              const stageWidth = interpolate(stageSpring, [0, 1], [0, stage.width]);
              const stageOpacity = interpolate(
                frame - 40 - i * 18,
                [0, 20],
                [0, 1],
                { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
              );

              // Conversion rate between stages
              const convRate =
                i > 0
                  ? `${((stages[i].value / stages[i - 1].value) * 100).toFixed(1)}%`
                  : null;

              return (
                <div key={stage.name} style={{ width: "100%", opacity: stageOpacity }}>
                  {convRate && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 11,
                        color: colors.textMuted,
                        marginBottom: 4,
                      }}
                    >
                      ↓ {convRate}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 16,
                    }}
                  >
                    <span style={{ fontSize: 13, color: colors.textMuted, width: 120, textAlign: "right" }}>
                      {stage.name}
                    </span>
                    <div
                      style={{
                        width: `${stageWidth}%`,
                        height: 44,
                        backgroundColor: `${stage.color}30`,
                        border: `1px solid ${stage.color}60`,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 80,
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, color: stage.color }}>
                        {stage.display}
                      </span>
                    </div>
                    <span style={{ width: 60 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Side metrics */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {[
              { label: "Topo → Meio", value: "12.8%", sub: "18.2K cliques" },
              { label: "Meio → Fundo", value: "26.4%", sub: "4.8K leads" },
              { label: "Fundo → Venda", value: "28.3%", sub: "340 vendas" },
              { label: "Receita Total", value: "R$66.9K", sub: "este mês" },
              { label: "ROI", value: "5.5x", sub: "invest. R$12.1K" },
            ].map((metric, i) => {
              const metricOpacity = interpolate(
                frame,
                [80 + i * 15, 100 + i * 15],
                [0, 1],
                { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
              );

              return (
                <div
                  key={i}
                  style={{
                    ...glassMorphism,
                    padding: "16px 20px",
                    opacity: metricOpacity,
                  }}
                >
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>{metric.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.text }}>{metric.value}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>{metric.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
