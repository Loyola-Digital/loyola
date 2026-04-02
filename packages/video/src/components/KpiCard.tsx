import React from "react";
import { interpolate, useCurrentFrame, spring } from "remotion";
import { colors, glassMorphism } from "../styles";

interface KpiCardProps {
  title: string;
  value: string;
  change?: string;
  positive?: boolean;
  delay?: number;
  icon?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  change,
  positive = true,
  delay = 0,
  icon,
}) => {
  const frame = useCurrentFrame();
  const scale = spring({
    frame: frame - delay,
    fps: 60,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });
  const opacity = interpolate(frame - delay, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        ...glassMorphism,
        padding: "24px 28px",
        minWidth: 220,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
        <span style={{ fontSize: 14, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: colors.text, marginBottom: 4 }}>
        {value}
      </div>
      {change && (
        <div style={{ fontSize: 14, color: positive ? colors.green : colors.red, fontWeight: 500 }}>
          {positive ? "▲" : "▼"} {change}
        </div>
      )}
    </div>
  );
};
