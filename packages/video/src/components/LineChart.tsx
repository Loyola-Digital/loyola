import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";

interface LineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  delay?: number;
  labels?: string[];
  title?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 600,
  height = 200,
  color = colors.brand,
  delay = 0,
  labels,
  title,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, 60], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const padding = { top: 20, right: 20, bottom: 40, left: 20 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((v - min) / range) * chartH;
    return { x, y };
  });

  const visibleCount = Math.floor(progress * points.length);
  const visiblePoints = points.slice(0, visibleCount + 1);

  const pathD = visiblePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD =
    visiblePoints.length > 1
      ? `${pathD} L ${visiblePoints[visiblePoints.length - 1].x} ${padding.top + chartH} L ${visiblePoints[0].x} ${padding.top + chartH} Z`
      : "";

  return (
    <div style={{ opacity }}>
      {title && (
        <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8, fontWeight: 500 }}>
          {title}
        </div>
      )}
      <svg width={width} height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + chartH * (1 - pct);
          return (
            <line
              key={pct}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`${color}15`} />}

        {/* Line */}
        {pathD && visiblePoints.length > 1 && (
          <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        )}

        {/* Dots */}
        {visiblePoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}

        {/* X labels */}
        {labels &&
          labels.map((label, i) => {
            const x = padding.left + (i / (labels.length - 1)) * chartW;
            return (
              <text
                key={i}
                x={x}
                y={height - 8}
                textAnchor="middle"
                fill={colors.textMuted}
                fontSize={11}
              >
                {label}
              </text>
            );
          })}
      </svg>
    </div>
  );
};
