"use client";

/**
 * O canvas do construtor de BI.
 *
 * Grade de 12 colunas com arrasto e redimensionamento próprios — sem
 * `react-grid-layout`. A aritmética inteira mora em `lib/bi/grid.ts` e é
 * testada lá; aqui fica só a ponte com o ponteiro.
 *
 * Dois estados separados, e não são o mesmo: `readOnly` é "não dá para editar
 * nada" e `layoutTravado` é "os dados são editáveis, mas as posições não". Um
 * dashboard em uso normal fica travado — só entra em modo de organizar quando a
 * pessoa pede.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALTURA_DA_LINHA,
  MARGEM,
  acomodar,
  alturaDoCanvas,
  celulaParaPx,
  dentroDaGrade,
  larguraDaColuna,
  type Bloco,
} from "@/lib/bi/grid";
import type { Widget } from "@/lib/bi/tipos";

/** Abaixo disto o grid de 12 colunas não cabe: em leitura, empilha. */
const LARGURA_ESTREITA = 768;

interface Arrasto {
  id: string;
  modo: "mover" | "redimensionar";
  px: number;
  py: number;
  geo: Bloco;
}

export interface BiCanvasProps {
  widgets: Widget[];
  /** Chamado ao soltar — nunca durante o arrasto, para não gerar um PUT por pixel. */
  onGeometriaMudou: (widgets: Widget[]) => void;
  renderWidget: (widget: Widget) => ReactNode;
  /** Controles do cabeçalho do card (editar, remover, duplicar). */
  renderAcoes?: (widget: Widget) => ReactNode;
  readOnly?: boolean;
  layoutTravado?: boolean;
  vazio?: ReactNode;
}

export function BiCanvas({
  widgets,
  onGeometriaMudou,
  renderWidget,
  renderAcoes,
  readOnly = false,
  layoutTravado = false,
  vazio,
}: BiCanvasProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [previa, setPrevia] = useState<Bloco[] | null>(null);

  // A largura vem medida, não fixa: o canvas fica ao lado de uma barra lateral
  // que abre e fecha, e uma largura de CSS não acompanharia isso.
  useEffect(() => {
    const no = areaRef.current;
    if (!no) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(entrada.contentRect.width);
    });
    observador.observe(no);
    setLargura(no.getBoundingClientRect().width);
    return () => observador.disconnect();
  }, []);

  const podeMexer = !readOnly && !layoutTravado;
  const empilhado = readOnly && largura > 0 && largura < LARGURA_ESTREITA;

  const blocos: Bloco[] = useMemo(
    () => previa ?? widgets.map((w) => ({ id: w.id, ...w.geometria })),
    [previa, widgets],
  );

  const comecar = useCallback(
    (evento: React.PointerEvent, widget: Widget, modo: Arrasto["modo"]) => {
      if (!podeMexer) return;
      evento.preventDefault();
      (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
      setArrasto({
        id: widget.id,
        modo,
        px: evento.clientX,
        py: evento.clientY,
        geo: { id: widget.id, ...widget.geometria },
      });
    },
    [podeMexer],
  );

  useEffect(() => {
    if (!arrasto || largura === 0) return;
    const coluna = larguraDaColuna(largura);
    const tipoDoWidget = widgets.find((w) => w.id === arrasto.id)?.tipo ?? "kpi";

    function mover(evento: PointerEvent) {
      const dx = Math.round((evento.clientX - arrasto!.px) / (coluna + MARGEM));
      const dy = Math.round((evento.clientY - arrasto!.py) / (ALTURA_DA_LINHA + MARGEM));
      const base = arrasto!.geo;
      const alvo =
        arrasto!.modo === "mover"
          ? { ...base, x: base.x + dx, y: base.y + dy }
          : { ...base, w: base.w + dx, h: base.h + dy };
      const preso = dentroDaGrade(alvo, tipoDoWidget);
      const atuais = widgets.map((w) => ({ id: w.id, ...w.geometria }));
      setPrevia(acomodar(atuais, { id: arrasto!.id, ...preso }));
    }

    function soltar() {
      setArrasto(null);
      setPrevia((atual) => {
        if (atual) {
          // O salvamento sai UMA vez, ao soltar. Durante o arrasto só o
          // desenho muda — é o que impede um PUT por pixel.
          onGeometriaMudou(
            widgets.map((w) => {
              const b = atual.find((x) => x.id === w.id);
              return b ? { ...w, geometria: { x: b.x, y: b.y, w: b.w, h: b.h } } : w;
            }),
          );
        }
        return null;
      });
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [arrasto, largura, widgets, onGeometriaMudou]);

  if (widgets.length === 0) {
    return (
      <div ref={areaRef} className="w-full">
        {vazio}
      </div>
    );
  }

  if (empilhado) {
    // Em leitura e tela estreita, a grade vira uma coluna. No modo de edição o
    // grid permanece de propósito: a posição não pode mudar por causa do
    // tamanho da janela de quem está organizando.
    return (
      <div ref={areaRef} className="flex w-full flex-col gap-4">
        {[...widgets]
          .sort((a, b) => a.geometria.y - b.geometria.y || a.geometria.x - b.geometria.x)
          .map((w) => (
            <CartaoDoWidget
              key={w.id}
              widget={w}
              estilo={{ height: w.geometria.h * ALTURA_DA_LINHA }}
              podeMexer={false}
              acoes={renderAcoes?.(w)}
            >
              {renderWidget(w)}
            </CartaoDoWidget>
          ))}
      </div>
    );
  }

  return (
    <div
      ref={areaRef}
      className="relative w-full"
      style={{ height: alturaDoCanvas(blocos) || undefined }}
    >
      {widgets.map((w) => {
        const bloco = blocos.find((b) => b.id === w.id) ?? { id: w.id, ...w.geometria };
        const px = celulaParaPx(bloco, largura || 1);
        const emMovimento = arrasto?.id === w.id;
        return (
          <CartaoDoWidget
            key={w.id}
            widget={w}
            estilo={{
              position: "absolute",
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
              // Sem transição durante o arrasto: animar o card que segue o dedo
              // dá a sensação de atraso.
              transition: arrasto ? "none" : "left 120ms ease, top 120ms ease",
              zIndex: emMovimento ? 20 : undefined,
            }}
            podeMexer={podeMexer}
            arrastando={emMovimento}
            acoes={renderAcoes?.(w)}
            onArrastar={(e) => comecar(e, w, "mover")}
            onRedimensionar={(e) => comecar(e, w, "redimensionar")}
          >
            {renderWidget(w)}
          </CartaoDoWidget>
        );
      })}
    </div>
  );
}

function CartaoDoWidget({
  widget,
  estilo,
  podeMexer,
  arrastando,
  acoes,
  onArrastar,
  onRedimensionar,
  children,
}: {
  widget: Widget;
  estilo: React.CSSProperties;
  podeMexer: boolean;
  arrastando?: boolean;
  acoes?: ReactNode;
  onArrastar?: (e: React.PointerEvent) => void;
  onRedimensionar?: (e: React.PointerEvent) => void;
  children: ReactNode;
}) {
  return (
    <div
      style={estilo}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        arrastando && "shadow-lg ring-2 ring-primary/40",
      )}
    >
      <header
        // O arrasto é SÓ no cabeçalho. Sem isto, clicar numa barra do gráfico
        // para ver o valor moveria o widget.
        className={cn(
          "widget-drag-handle flex shrink-0 items-center gap-2 border-b px-3 py-2",
          podeMexer ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        onPointerDown={podeMexer ? onArrastar : undefined}
      >
        {podeMexer && <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />}
        <h3 className="truncate text-sm font-medium">{widget.titulo}</h3>
        {acoes && (
          // `.no-drag` + `stopPropagation`: o `pointerdown` do botão não pode
          // subir para o cabeçalho, senão clicar em "remover" arrasta o card.
          <div className="no-drag ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {acoes}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-3">{children}</div>

      {podeMexer && (
        <button
          type="button"
          aria-label="Redimensionar"
          onPointerDown={onRedimensionar}
          className="no-drag absolute bottom-0 right-0 size-4 cursor-se-resize rounded-tl border-l border-t bg-muted/60 hover:bg-muted"
        />
      )}
    </div>
  );
}
