import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from "remotion";
import { colors, fullScreen } from "../styles";
import { LogoIcon } from "../components/LogoIcon";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const logoScale = spring({
    frame,
    fps: 60,
    config: { damping: 10, stiffness: 80, mass: 0.8 },
  });

  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [15, 40]
  );

  return (
    <AbsoluteFill style={fullScreen}>
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.brand}20 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          filter: `blur(${glowIntensity}px)`,
        }}
      />

      <div
        style={{
          transform: `scale(${logoScale})`,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${colors.brand}60)`,
          marginBottom: 24,
        }}
      >
        <LogoIcon size={100} />
      </div>

      <div
        style={{
          fontSize: 48,
          fontWeight: 800,
          opacity: textOpacity,
          background: `linear-gradient(135deg, ${colors.text} 0%, ${colors.brand} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: -1,
        }}
      >
        LOYOLA DIGITAL X
      </div>

      <div
        style={{
          fontSize: 16,
          color: colors.textMuted,
          opacity: textOpacity,
          marginTop: 12,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        Inteligência Artificial ao seu Alcance
      </div>
    </AbsoluteFill>
  );
};
