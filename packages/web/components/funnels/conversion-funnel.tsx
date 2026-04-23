"use client";

interface ConversionFunnelProps {
  impressions: number;
  linkClicks: number | null;
  landingPageViews: number | null;
  leads: number | null;
  checkoutVisits?: number | null;
  sales?: number | null;
}

interface FunnelStage {
  label: string;
  value: number;
  color: string;
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

const STAGE_HEIGHT = 55;
const CONVERSION_GAP = 22;
const TOTAL_WIDTH = 520;
const MIN_WIDTH = 160;
const MARGIN_X = 10;
const SVG_WIDTH = TOTAL_WIDTH + MARGIN_X * 2;

/**
 * Funil de conversão em formato trapezoidal (SVG custom, zero dependência nova).
 *
 * Até 6 etapas (condicionais): Impressões → Cliques no Link → Visualização da LP → Leads → Visitas Checkout → Vendas.
 *
 * Cada etapa é um trapézio cuja largura do topo é proporcional ao valor da etapa
 * e a largura da base é proporcional ao valor da próxima (conecta visualmente).
 *
 * Tudo renderizado DENTRO do SVG:
 * - Label da etapa no topo do trapézio (fonte branca, peso semibold)
 * - Valor absoluto no centro (fonte branca, maior)
 * - % de conversão na "faixa" entre um trapézio e o próximo (fonte muted)
 */
export function ConversionFunnel({
  impressions,
  linkClicks,
  landingPageViews,
  leads,
  checkoutVisits,
  sales,
}: ConversionFunnelProps) {
  const stages: FunnelStage[] = [
    { label: "Impressões", value: impressions, color: "hsl(220 80% 55%)" },
  ];

  if (linkClicks !== null && linkClicks > 0) {
    stages.push({
      label: "Cliques no Link",
      value: linkClicks,
      color: "hsl(200 70% 50%)",
    });
  }
  if (landingPageViews !== null && landingPageViews > 0) {
    stages.push({
      label: "Visualização da LP",
      value: landingPageViews,
      color: "hsl(35 85% 55%)",
    });
  }
  if (leads !== null && leads > 0) {
    stages.push({
      label: "Leads",
      value: leads,
      color: "hsl(150 60% 45%)",
    });
  }
  if (checkoutVisits != null && checkoutVisits > 0) {
    stages.push({
      label: "Visitas Checkout",
      value: checkoutVisits,
      color: "hsl(270 70% 50%)",
    });
  }
  if (sales != null && sales > 0) {
    stages.push({
      label: "Vendas",
      value: sales,
      color: "hsl(0 85% 50%)",
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
  // Cada etapa ocupa STAGE_HEIGHT + gap entre ela e a próxima (exceto a última)
  const svgHeight =
    stages.length * STAGE_HEIGHT + Math.max(0, stages.length - 1) * CONVERSION_GAP + 10;

  function widthForValue(v: number): number {
    return Math.max((v / maxValue) * TOTAL_WIDTH, MIN_WIDTH);
  }

  return (
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
        const y = 5 + i * (STAGE_HEIGHT + CONVERSION_GAP);
        const yBottom = y + STAGE_HEIGHT;
        const points = [
          `${centerX - topW / 2},${y}`,
          `${centerX + topW / 2},${y}`,
          `${centerX + bottomW / 2},${yBottom}`,
          `${centerX - bottomW / 2},${yBottom}`,
        ].join(" ");

        const prev = i > 0 ? stages[i - 1] : null;
        const conversionY = y - CONVERSION_GAP / 2;

        return (
          <g key={stage.label}>
            {/* % de conversão da etapa anterior PRA esta (renderiza no gap acima) */}
            {prev && (
              <g>
                <text
                  x={centerX}
                  y={conversionY - 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  ↓ {conversionRate(prev.value, stage.value)} de conversão
                </text>
              </g>
            )}

            {/* Trapézio */}
            <polygon
              points={points}
              fill={stage.color}
              fillOpacity={0.9}
              stroke={stage.color}
              strokeWidth={1}
            />

            {/* Label da etapa (topo do trapézio) */}
            <text
              x={centerX}
              y={y + 18}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={600}
              fill="#fff"
            >
              {stage.label}
            </text>

            {/* Valor absoluto (centro-baixo do trapézio) */}
            <text
              x={centerX}
              y={y + STAGE_HEIGHT - 22}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fontWeight={700}
              fill="#fff"
            >
              {fmtNumber(stage.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
