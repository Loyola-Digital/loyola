import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { colors, fullScreen } from "../styles";
import { SidebarMock } from "../components/SidebarMock";
import { MindCardMock } from "../components/MindCardMock";

const minds = [
  { name: "Alex Hormozi", role: "Growth & Offers", squad: "MMOs Squad", color: colors.brand },
  { name: "Steve Jobs", role: "Product Vision", squad: "MMOs Squad", color: colors.blue },
  { name: "Andrej Karpathy", role: "AI / ML Expert", squad: "MMOs Squad", color: colors.purple },
  { name: "Dan Kennedy", role: "Direct Response", squad: "Content Engine", color: colors.orange },
  { name: "Seth Godin", role: "Marketing Strategy", squad: "Content Engine", color: colors.green },
  { name: "Gary Halbert", role: "Copywriting", squad: "Content Engine", color: colors.red },
  { name: "David Ogilvy", role: "Advertising", squad: "MMOs Squad", color: colors.cyan },
  { name: "Russell Brunson", role: "Funnels", squad: "Content Engine", color: "#e879f9" },
  { name: "Ryan Holiday", role: "Growth Hacking", squad: "Content Engine", color: "#f472b6" },
];

export const MindsScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Title entrance
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Network visualization
  const networkOpacity = interpolate(frame, [120, 160], [0, 0.3], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const networkScale = interpolate(frame, [120, 200], [0.8, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Exit
  const exitOpacity = interpolate(frame, [380, 420], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "row", alignItems: "stretch", opacity: exitOpacity }}>
      <SidebarMock activeItem="minds" />

      <div style={{ flex: 1, padding: "40px 48px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        {/* Network bg visualization */}
        <svg
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${networkScale})`,
            opacity: networkOpacity,
            width: 800,
            height: 600,
          }}
        >
          {minds.slice(0, 7).map((mind, i) => {
            const angle = (i / 7) * Math.PI * 2;
            const cx = 400 + Math.cos(angle) * 200;
            const cy = 300 + Math.sin(angle) * 180;
            return (
              <React.Fragment key={i}>
                <line x1={400} y1={300} x2={cx} y2={cy} stroke={mind.color} strokeWidth={1} opacity={0.4} />
                <circle cx={cx} cy={cy} r={6} fill={mind.color} opacity={0.6} />
              </React.Fragment>
            );
          })}
          <circle cx={400} cy={300} r={10} fill={colors.brand} />
        </svg>

        {/* Header */}
        <div style={{ opacity: titleOpacity, marginBottom: 32, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>🧠</span>
            <h1 style={{ fontSize: 36, fontWeight: 700, color: colors.text, margin: 0 }}>
              Central de Mentes
            </h1>
          </div>
          <p style={{ fontSize: 16, color: colors.textMuted, margin: 0 }}>
            27+ mentes AI clonadas organizadas em 6 squads especializados
          </p>
        </div>

        {/* Squad label */}
        <div
          style={{
            fontSize: 13,
            color: colors.brand,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 16,
            opacity: titleOpacity,
            zIndex: 1,
          }}
        >
          MMOs Squad · Content Engine
        </div>

        {/* Mind cards grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            zIndex: 1,
          }}
        >
          {minds.map((mind, i) => (
            <MindCardMock
              key={mind.name}
              {...mind}
              delay={20 + i * 12}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
