import React from "react";
import { interpolate, useCurrentFrame, spring } from "remotion";
import { colors, glassMorphism } from "../styles";

interface MindCardMockProps {
  name: string;
  role: string;
  squad: string;
  color: string;
  delay?: number;
}

export const MindCardMock: React.FC<MindCardMockProps> = ({
  name,
  role,
  squad,
  color,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const y = spring({
    frame: frame - delay,
    fps: 60,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });
  const translateY = interpolate(y, [0, 1], [60, 0]);
  const opacity = interpolate(frame - delay, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      style={{
        ...glassMorphism,
        padding: "20px 24px",
        width: 240,
        transform: `translateY(${translateY}px)`,
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: "#000",
          }}
        >
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{name}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{role}</div>
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color,
          backgroundColor: `${color}20`,
          padding: "4px 10px",
          borderRadius: 8,
          alignSelf: "flex-start",
          fontWeight: 500,
        }}
      >
        {squad}
      </div>
    </div>
  );
};
