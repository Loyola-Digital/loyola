"use client";

import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelStageFormula,
  buildFunnelStageConversionFormula,
} from "@/lib/formulas/funnels";

interface ConversionFunnelProps {
  impressions: number;
  linkClicks: number | null;
  landingPageViews: number | null;
  leads: number | null;
}

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  source: string;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function conversionRate(from: number, to: number): string {
  if (from === 0) return "0%";
  return `${((to / from) * 100).toFixed(1)}%`;
}

const STAGE_HEIGHT = 60;
const TOTAL_WIDTH = 380;
const MIN_WIDTH = 60;
const MARGIN_X = 10;
const SVG_WIDTH = TOTAL_WIDTH + MARGIN_X * 2;

/**
 * Funil de conversão em formato trapezoidal (SVG custom, zero dependência nova).
 *
 * 4 etapas: Impressões → Cliques no Link → Visualização da LP → Leads.
 * Reach foi removido nesta iteração (Story 18.4) — Story 18.1 mostrou que a
 * métrica não agrega muito valor na prática.
 *
 * Cada etapa é um trapézio cuja largura do topo é proporcional ao valor da etapa
 * e a largura da base é proporcional ao valor da próxima (conecta visualmente
 * o fluxo, criando a silhueta clássica de funil).
 *
 * Tooltips mantidos: valor absoluto + taxa de conversão em relação à etapa anterior.
 */
export function ConversionFunnel({
  impressions,
  linkClicks,
  landingPageViews,
  leads,
}: ConversionFunnelProps) {
  const stages: FunnelStage[] = [
    {
      label: "Impressões",
      value: impressions,
      color: "hsl(220 80% 55%)",
      source: "Meta Ads API · impressions",
    },
  ];

  if (linkClicks !== null && linkClicks > 0) {
    stages.push({
      label: "Cliques no Link",
      value: linkClicks,
      color: "hsl(200 70% 50%)",
      source: "Meta Ads API · actions[link_click]",
    });
  }
  if (landingPageViews !== null && landingPageViews > 0) {
    stages.push({
      label: "Visualização da LP",
      value: landingPageViews,
      color: "hsl(35 85% 55%)",
      source: "Meta Ads API · actions[landing_page_view]",
    });
  }
  if (leads !== null && leads > 0) {
    stages.push({
      label: "Leads",
      value: leads,
      color: "hsl(150 60% 45%)",
      source: "Planilha vinculada · contagem das linhas categorizadas",
    });
  }

  if (stages.length === 0 || impressions === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem dados suficientes pra renderizar o funil.
      </p>
    );
  }

  const maxValue = stages[0].value;
  const centerX = MARGIN_X + TOTAL_WIDTH / 2;
  const svgHeight = stages.length * STAGE_HEIGHT + 10;

  function widthForValue(v: number): number {
    return Math.max((v / maxValue) * TOTAL_WIDTH, MIN_WIDTH);
  }

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Funil de conversão"
      >
        {stages.map((stage, i) => {
          const topW = widthForValue(stage.value);
          const bottomW =
            i + 1 < stages.length ? widthForValue(stages[i + 1].value) : topW * 0.5;
          const y = i * STAGE_HEIGHT + 5;
          const yBottom = y + STAGE_HEIGHT;
          const points = [
            `${centerX - topW / 2},${y}`,
            `${centerX + topW / 2},${y}`,
            `${centerX + bottomW / 2},${yBottom}`,
            `${centerX - bottomW / 2},${yBottom}`,
          ].join(" ");
          return (
            <g key={stage.label}>
              <polygon
                points={points}
                fill={stage.color}
                fillOpacity={0.85}
                stroke={stage.color}
                strokeWidth={1}
              />
              <text
                x={centerX}
                y={y + STAGE_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={600}
                fill="#fff"
              >
                {fmtNumber(stage.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Labels + taxas de conversão abaixo do SVG */}
      <div className="space-y-1.5">
        {stages.map((stage, i) => {
          const prev = i > 0 ? stages[i - 1] : null;
          const stageFormula = buildFunnelStageFormula(stage.label, stage.value, stage.source);
          const conversionFormula = prev
            ? buildFunnelStageConversionFormula(prev.label, prev.value, stage.label, stage.value)
            : undefined;
          return (
            <div
              key={`${stage.label}-row`}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="font-medium">{stage.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <MetricTooltip
                  label={stage.label}
                  value={fmtNumber(stage.value)}
                  formula={stageFormula}
                >
                  <span className="tabular-nums cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                    {fmtNumber(stage.value)}
                  </span>
                </MetricTooltip>
                {prev && (
                  <MetricTooltip
                    label={`${prev.label} → ${stage.label}`}
                    value={conversionRate(prev.value, stage.value)}
                    formula={conversionFormula}
                  >
                    <span className="text-[11px] text-muted-foreground cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 w-12 text-right tabular-nums">
                      {conversionRate(prev.value, stage.value)}
                    </span>
                  </MetricTooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
