import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from "remotion";
import { colors, fullScreen, glassMorphism } from "../styles";
import { SidebarMock } from "../components/SidebarMock";

const tasks = [
  {
    title: "Criar landing page SaaS",
    mind: "Steve Jobs",
    status: "done" as const,
    priority: "Alta",
    created: "28 Mar",
  },
  {
    title: "Escrever copy de email welcome",
    mind: "Gary Halbert",
    status: "in_progress" as const,
    priority: "Média",
    created: "30 Mar",
  },
  {
    title: "Planejar campanha retarget",
    mind: "Dan Kennedy",
    status: "in_progress" as const,
    priority: "Alta",
    created: "31 Mar",
  },
  {
    title: "Analisar métricas de reels",
    mind: "Alex Hormozi",
    status: "review" as const,
    priority: "Média",
    created: "01 Abr",
  },
  {
    title: "Definir stack de precificação",
    mind: "Alex Hormozi",
    status: "pending" as const,
    priority: "Alta",
    created: "01 Abr",
  },
  {
    title: "Roteiro video de vendas",
    mind: "Russell Brunson",
    status: "pending" as const,
    priority: "Média",
    created: "01 Abr",
  },
];

const statusConfig = {
  done: { label: "Concluída", color: colors.green, bg: `${colors.green}20` },
  in_progress: { label: "Em Progresso", color: colors.blue, bg: `${colors.blue}20` },
  review: { label: "Revisão", color: colors.purple, bg: `${colors.purple}20` },
  pending: { label: "Pendente", color: colors.textMuted, bg: `${colors.textMuted}20` },
};

const priorityConfig: Record<string, { color: string }> = {
  Alta: { color: colors.red },
  Média: { color: colors.orange },
  Baixa: { color: colors.green },
};

export const TasksScene: React.FC = () => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [260, 300], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "row", alignItems: "stretch", opacity: exitOpacity }}>
      <SidebarMock activeItem="tasks" />

      <div style={{ flex: 1, padding: "32px 40px", display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>✅</span> Tarefas
            </h1>
            <p style={{ fontSize: 14, color: colors.textMuted, margin: "4px 0 0" }}>
              Delegações criadas durante conversas com mentes AI → ClickUp
            </p>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 8 }}>
            {["Todas", "Em progresso", "Pendentes"].map((filter, i) => {
              const isActive = i === 0;
              return (
                <div
                  key={filter}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor: isActive ? `${colors.brand}20` : colors.surface,
                    color: isActive ? colors.brand : colors.textMuted,
                    border: `1px solid ${isActive ? `${colors.brand}40` : colors.border}`,
                  }}
                >
                  {filter}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "Total", value: "24", icon: "📋" },
            { label: "Em Progresso", value: "8", icon: "🔄" },
            { label: "Concluídas", value: "12", icon: "✅" },
            { label: "Pendentes", value: "4", icon: "⏳" },
          ].map((stat, i) => {
            const statOpacity = interpolate(frame, [10 + i * 8, 30 + i * 8], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            });
            return (
              <div
                key={stat.label}
                style={{
                  ...glassMorphism,
                  flex: 1,
                  padding: "16px 20px",
                  opacity: statOpacity,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 24 }}>{stat.icon}</span>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.text }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{stat.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Task list */}
        <div
          style={{
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: "8px 0",
            flex: 1,
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "flex",
              padding: "10px 24px",
              borderBottom: `1px solid ${colors.border}`,
              fontSize: 11,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            <div style={{ flex: 4 }}>Tarefa</div>
            <div style={{ flex: 2 }}>Mente</div>
            <div style={{ flex: 1, textAlign: "center" }}>Status</div>
            <div style={{ flex: 1, textAlign: "center" }}>Prioridade</div>
            <div style={{ flex: 1, textAlign: "right" }}>Criada</div>
          </div>

          {tasks.map((task, i) => {
            const rowSpring = spring({
              frame: Math.max(0, frame - 40 - i * 12),
              fps: 60,
              config: { damping: 12, stiffness: 100, mass: 0.5 },
            });
            const translateX = interpolate(rowSpring, [0, 1], [40, 0]);
            const rowOpacity = interpolate(
              frame - 40 - i * 12,
              [0, 15],
              [0, 1],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
            );

            const sc = statusConfig[task.status];
            const pc = priorityConfig[task.priority];

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  padding: "12px 24px",
                  borderBottom: `1px solid ${colors.border}`,
                  alignItems: "center",
                  opacity: rowOpacity,
                  transform: `translateX(${translateX}px)`,
                }}
              >
                <div style={{ flex: 4, fontSize: 14, fontWeight: 500, color: colors.text }}>
                  {task.title}
                </div>
                <div style={{ flex: 2, fontSize: 13, color: colors.brand }}>
                  🧠 {task.mind}
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 6,
                      backgroundColor: sc.bg,
                      color: sc.color,
                      fontWeight: 500,
                    }}
                  >
                    {sc.label}
                  </span>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: pc.color, fontWeight: 500 }}>
                    ● {task.priority}
                  </span>
                </div>
                <div style={{ flex: 1, textAlign: "right", fontSize: 12, color: colors.textMuted }}>
                  {task.created}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
