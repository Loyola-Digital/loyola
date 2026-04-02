import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  spring,
} from "remotion";
import { colors, fullScreen } from "../styles";
import { LogoIcon } from "../components/LogoIcon";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Logo entrance
  const logoScale = spring({
    frame,
    fps: 60,
    config: { damping: 8, stiffness: 60, mass: 1 },
  });

  // Title entrance
  const titleOpacity = interpolate(frame, [40, 70], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const titleY = interpolate(frame, [40, 70], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Subtitle entrance
  const subOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Tagline entrance
  const tagOpacity = interpolate(frame, [130, 160], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Glow pulse on logo
  const glowIntensity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [20, 60]
  );

  // Grid pattern animation
  const gridOpacity = interpolate(frame, [0, 60], [0, 0.08], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Exit fade
  const exitOpacity = interpolate(frame, [310, 360], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, opacity: exitOpacity }}>
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(${colors.brand}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.brand}40 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.brand}15 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          filter: `blur(${glowIntensity}px)`,
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          marginBottom: 32,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${colors.brand}80)`,
        }}
      >
        <LogoIcon size={120} />
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: -2,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          background: `linear-gradient(135deg, ${colors.text} 0%, ${colors.brand} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        LOYOLA DIGITAL X
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 24,
          color: colors.textMuted,
          opacity: subOpacity,
          marginTop: 16,
          fontWeight: 400,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        Agência de Negócios Digitais
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 20,
          opacity: tagOpacity,
          marginTop: 40,
          padding: "12px 32px",
          borderRadius: 12,
          border: `1px solid ${colors.brand}40`,
          background: `${colors.brand}10`,
          color: colors.brand,
          fontWeight: 500,
        }}
      >
        27+ Mentes AI · Chat em Tempo Real · Analytics Integrado
      </div>
    </AbsoluteFill>
  );
};
