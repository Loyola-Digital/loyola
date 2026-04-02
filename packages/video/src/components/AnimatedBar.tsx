import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";

interface AnimatedBarProps {
  value: number; // 0-100
  maxWidth: number;
  height?: number;
  color?: string;
  delay?: number;
  label?: string;
  showValue?: string;
}

export const AnimatedBar: React.FC<AnimatedBarProps> = ({
  value,
  maxWidth,
  height = 32,
  color = colors.brand,
  delay = 0,
  label,
  showValue,
}) => {
  const frame = useCurrentFrame();
  const width = interpolate(frame - delay, [0, 40], [0, (value / 100) * maxWidth], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity,
        marginBottom: 12,
      }}
    >
      {label && (
        <span style={{ width: 120, fontSize: 16, color: colors.textMuted, textAlign: "right" }}>
          {label}
        </span>
      )}
      <div
        style={{
          width: maxWidth,
          height,
          backgroundColor: colors.surface,
          borderRadius: height / 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width,
            height: "100%",
            backgroundColor: color,
            borderRadius: height / 2,
            transition: "width 0.1s",
          }}
        />
      </div>
      {showValue && (
        <span style={{ fontSize: 16, fontWeight: 600, color: colors.text, minWidth: 60 }}>
          {showValue}
        </span>
      )}
    </div>
  );
};
