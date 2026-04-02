import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";
import { LogoIcon } from "./LogoIcon";

interface SidebarMockProps {
  activeItem?: string;
  delay?: number;
}

const menuItems = [
  { icon: "🧠", label: "Central de Mentes", key: "minds" },
  { icon: "💬", label: "Conversas", key: "chat" },
  { icon: "📊", label: "Instagram", key: "instagram" },
  { icon: "📣", label: "Meta Ads", key: "ads" },
  { icon: "🎯", label: "Funis", key: "funnel" },
  { icon: "✅", label: "Tarefas", key: "tasks" },
  { icon: "⚙️", label: "Configurações", key: "settings" },
];

export const SidebarMock: React.FC<SidebarMockProps> = ({
  activeItem = "minds",
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const slideX = interpolate(frame - delay, [0, 30], [-260, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        width: 260,
        height: "100%",
        backgroundColor: colors.bgCard,
        borderRight: `1px solid ${colors.border}`,
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transform: `translateX(${slideX}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, paddingLeft: 8 }}>
        <LogoIcon size={32} />
        <span style={{ fontSize: 18, fontWeight: 700, color: colors.text }}>Loyola Digital X</span>
      </div>

      {menuItems.map((item, i) => {
        const isActive = item.key === activeItem;
        const itemOpacity = interpolate(frame - delay, [10 + i * 5, 20 + i * 5], [0, 1], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        });

        return (
          <div
            key={item.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 10,
              backgroundColor: isActive ? `${colors.brand}15` : "transparent",
              border: isActive ? `1px solid ${colors.brand}30` : "1px solid transparent",
              opacity: itemOpacity,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? colors.brand : colors.textMuted,
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 10,
          backgroundColor: colors.surface,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${colors.brand}, ${colors.orange})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            color: "#000",
          }}
        >
          LV
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>Lucas Vital</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>Admin</div>
        </div>
      </div>
    </div>
  );
};
