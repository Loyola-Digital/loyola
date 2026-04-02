import { CSSProperties } from "react";

export const colors = {
  brand: "#fdd449",
  brandDark: "#e5b800",
  bg: "#0a0a0a",
  bgCard: "#141414",
  bgCardHover: "#1a1a1a",
  surface: "#1e1e1e",
  border: "#2a2a2a",
  text: "#e5e5e5",
  textMuted: "#888888",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#06b6d4",
};

export const fullScreen: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.bg,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: colors.text,
  overflow: "hidden",
};

export const glassMorphism: CSSProperties = {
  background: "rgba(20, 20, 20, 0.8)",
  backdropFilter: "blur(20px)",
  border: `1px solid ${colors.border}`,
  borderRadius: 16,
};
