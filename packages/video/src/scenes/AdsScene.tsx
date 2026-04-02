import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from "remotion";
import { colors, fullScreen, glassMorphism } from "../styles";
import { SidebarMock } from "../components/SidebarMock";
import { KpiCard } from "../components/KpiCard";
import { LineChart } from "../components/LineChart";

const spendData = [320, 450, 380, 520, 610, 480, 550, 700, 650, 780, 820, 900];
const roasData = [2.1, 2.4, 2.8, 2.6, 3.1, 3.4, 3.2, 3.8, 3.5, 4.1, 3.9, 4.3];

const campaigns = [
  { name: "Lançamento SaaS — Topo", status: "Ativo", spend: "R$4.820", roas: "3.8x", cpl: "R$12.40", impressions: "142K" },
  { name: "Retarget — Carrinho Abandonado", status: "Ativo", spend: "R$2.150", roas: "5.2x", cpl: "R$8.90", impressions: "67K" },
  { name: "Lookalike — Compradores", status: "Ativo", spend: "R$3.200", roas: "4.1x", cpl: "R$15.60", impressions: "98K" },
  { name: "Awareness — Conteúdo", status: "Pausado", spend: "R$1.890", roas: "1.9x", cpl: "R$22.30", impressions: "210K" },
];

export const AdsScene: React.FC = () => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [320, 360], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "row", alignItems: "stretch", opacity: exitOpacity }}>
      <SidebarMock activeItem="ads" />

      <div style={{ flex: 1, padding: "32px 40px", display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>📣</span> Meta Ads Dashboard
          </h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: "4px 0 0" }}>
            Conta: Loyola Digital · Últimos 30 dias
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 16 }}>
          <KpiCard title="Investimento" value="R$12.1K" change="+18%" positive delay={8} icon="💰" />
          <KpiCard title="ROAS" value="3.8x" change="+0.6x" positive delay={16} icon="📈" />
          <KpiCard title="CPL" value="R$14.30" change="-12%" positive delay={24} icon="🎯" />
          <KpiCard title="Conversões" value="847" change="+32%" positive delay={32} icon="🔥" />
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {/* Spend chart */}
          <div
            style={{
              flex: 1,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <LineChart
              data={spendData}
              width={520}
              height={180}
              color={colors.green}
              delay={40}
              title="Investimento Diário (R$)"
              labels={["01", "05", "09", "13", "17", "21", "25", "27", "28", "29", "30", "31"]}
            />
          </div>

          {/* ROAS chart */}
          <div
            style={{
              flex: 1,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <LineChart
              data={roasData}
              width={520}
              height={180}
              color={colors.brand}
              delay={50}
              title="ROAS Diário"
              labels={["01", "05", "09", "13", "17", "21", "25", "27", "28", "29", "30", "31"]}
            />
          </div>
        </div>

        {/* Campaign table */}
        <div
          style={{
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: "16px 24px",
          }}
        >
          <div style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 12 }}>
            Campanhas Ativas
          </div>

          {/* Table header */}
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            <div style={{ flex: 3 }}>Campanha</div>
            <div style={{ flex: 1, textAlign: "center" }}>Status</div>
            <div style={{ flex: 1, textAlign: "right" }}>Invest.</div>
            <div style={{ flex: 1, textAlign: "right" }}>ROAS</div>
            <div style={{ flex: 1, textAlign: "right" }}>CPL</div>
            <div style={{ flex: 1, textAlign: "right" }}>Impressões</div>
          </div>

          {/* Table rows */}
          {campaigns.map((c, i) => {
            const rowOpacity = interpolate(frame, [80 + i * 15, 100 + i * 15], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  padding: "10px 0",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: 13,
                  opacity: rowOpacity,
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 3, color: colors.text, fontWeight: 500 }}>{c.name}</div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 6,
                      backgroundColor: c.status === "Ativo" ? `${colors.green}20` : `${colors.textMuted}20`,
                      color: c.status === "Ativo" ? colors.green : colors.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    {c.status}
                  </span>
                </div>
                <div style={{ flex: 1, textAlign: "right", color: colors.text }}>{c.spend}</div>
                <div style={{ flex: 1, textAlign: "right", color: colors.green, fontWeight: 600 }}>{c.roas}</div>
                <div style={{ flex: 1, textAlign: "right", color: colors.text }}>{c.cpl}</div>
                <div style={{ flex: 1, textAlign: "right", color: colors.textMuted }}>{c.impressions}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
