"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Squad } from "@loyola-x/shared";

// Canvas-based — no SSR
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        <span className="text-sm text-muted-foreground">Carregando rede neural...</span>
      </div>
    </div>
  ),
});

const HEX_COLORS = [
  "#f43f5e", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface GraphNode {
  id: string;
  type: "root" | "squad" | "mind";
  label: string;
  mindId?: string;
  color: string;
  val: number;
}

interface MindsNetworkProps {
  squads: Squad[];
}

export function MindsNetwork({ squads }: MindsNetworkProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [
      {
        id: "root",
        type: "root",
        label: "Loyola X",
        color: "hsl(47, 98%, 54%)",
        val: 45,
      },
    ];
    const links: { source: string; target: string }[] = [];

    squads.forEach((squad) => {
      const squadColor = HEX_COLORS[hashName(squad.name) % HEX_COLORS.length];
      nodes.push({
        id: `squad-${squad.id}`,
        type: "squad",
        label: squad.displayName,
        color: squadColor,
        val: 18,
      });
      links.push({ source: "root", target: `squad-${squad.id}` });

      squad.minds.forEach((mind) => {
        nodes.push({
          id: `mind-${mind.id}`,
          type: "mind",
          label: mind.name,
          mindId: mind.id,
          color: HEX_COLORS[hashName(mind.name) % HEX_COLORS.length],
          val: 7,
        });
        links.push({ source: `squad-${squad.id}`, target: `mind-${mind.id}` });
      });
    });

    return { nodes, links };
  }, [squads]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.type === "mind" && node.mindId) {
        router.push(`/minds/${node.mindId}`);
      }
    },
    [router],
  );

  const drawNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const { x = 0, y = 0, type, label, color, val } = node as GraphNode & {
        x: number;
        y: number;
      };

      const r =
        type === "root" ? 16 : type === "squad" ? Math.sqrt(val) * 2.2 : Math.sqrt(val) * 2;

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = type === "root" ? 24 : type === "squad" ? 14 : 8;

      // Fill circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle =
        type === "root"
          ? "hsl(47, 98%, 54%)"
          : type === "squad"
            ? color + "dd"
            : color + "99";
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = color;
      ctx.lineWidth = type === "root" ? 2.5 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Initials / label inside
      if (type === "root") {
        const fontSize = Math.max(6, r * 0.55);
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";
        ctx.fillText("LX", x, y);
      } else {
        const initials = getInitials(label);
        const fontSize = Math.max(3, r * 0.6);
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(initials.substring(0, 2), x, y);
      }

      // Squad label below (always) / mind label when zoomed
      const showLabel =
        type === "squad" || (type === "mind" && globalScale > 1.8);
      if (showLabel) {
        const fontSize = Math.max(4, 11 / globalScale);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(148,163,184,0.9)";
        const displayLabel =
          type === "squad" ? label : label.split(" ")[0];
        ctx.fillText(displayLabel, x, y + r + 2 / globalScale);
      }
    },
    [],
  );

  return (
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeId="id"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeLabel={(n: any) => (n as GraphNode).label}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onNodeClick={(node: any) => handleNodeClick(node as GraphNode)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const n = node as GraphNode & { x: number; y: number };
          const r = n.type === "root" ? 16 : n.type === "squad" ? 10 : 6;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={() => "rgba(212, 168, 67, 0.12)"}
        linkWidth={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={() => "rgba(212, 168, 67, 0.5)"}
        backgroundColor="transparent"
        cooldownTicks={120}
        enableNodeDrag
        enablePanInteraction
        enableZoomInteraction
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
