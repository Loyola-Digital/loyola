"use client";

/**
 * Miniatura de um mapa, para a lista global.
 *
 * Desenha os retângulos do desenho real em vez de um ícone genérico: com uma
 * dúzia de mapas na tela, a forma é o que deixa reconhecer qual é qual antes
 * de abrir.
 */

import type { PreviaDoBloco } from "@/lib/hooks/use-funnel-maps-global";

const TIPO_NOTA = "nota";
const TIPO_TEXTO = "texto";

export function MapaMiniatura({ blocos }: { blocos: PreviaDoBloco[] }) {
  if (blocos.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border/50 text-[11px] text-muted-foreground">
        Ainda sem desenho
      </div>
    );
  }

  // Enquadra o conteúdo na viewBox: mapas ficam em coordenadas quaisquer (e
  // podem ser negativas), então a miniatura não pode assumir origem em 0,0.
  const minX = Math.min(...blocos.map((b) => b.x));
  const minY = Math.min(...blocos.map((b) => b.y));
  const maxX = Math.max(...blocos.map((b) => b.x + b.width));
  const maxY = Math.max(...blocos.map((b) => b.y + b.height));
  const pad = 24;
  const w = Math.max(maxX - minX, 1) + pad * 2;
  const h = Math.max(maxY - minY, 1) + pad * 2;

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`}
      className="h-24 w-full rounded-md border border-border/40 bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Prévia com ${blocos.length} blocos`}
    >
      {blocos.map((b, i) => {
        // Texto solto não tem moldura no editor; na miniatura vira uma barra
        // discreta, senão sumiria e a prévia mentiria sobre o que há no mapa.
        if (b.type === TIPO_TEXTO) {
          return (
            <rect
              key={i}
              x={b.x}
              y={b.y + b.height / 3}
              width={b.width}
              height={Math.max(b.height / 3, 6)}
              fill="currentColor"
              className="text-muted-foreground/40"
              rx={2}
            />
          );
        }
        return (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={6}
            fill={b.type === TIPO_NOTA ? b.color : `${b.color}22`}
            stroke={b.color}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
