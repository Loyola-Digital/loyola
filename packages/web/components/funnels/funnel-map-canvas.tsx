"use client";

/**
 * Mapa do Funil — canvas livre com a UX do Whimsical, sobre os StageCards do app.
 *
 * A decisão que sustenta o arquivo: o nó NÃO é um card novo, é o `StageCard` de
 * sempre com `pointer-events: none`. O visual continua sendo o do design system
 * (e acompanha qualquer mudança futura nele de graça), enquanto a camada de cima
 * cuida de selecionar, arrastar, ligar e abrir. Duplicar o card aqui daria
 * divergência visual na primeira alteração.
 *
 * Coordenadas: tudo que é persistido está em MUNDO. `view` (x, y, z) traduz
 * mundo↔tela. Guardar posição em tela quebraria o mapa a cada zoom.
 *
 * Persistência: posições e arestas vão juntas num único JSONB do funil, com
 * debounce — arrastar um nó emite dezenas de frames e não pode virar dezenas de
 * PUTs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Maximize2, Minus, Plus, Redo2, Undo2, Keyboard, Trash2, Copy, Pencil,
  ExternalLink, Link2, Unlink, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StageCard } from "./stage-card";
import { useCreateStage, useDeleteStage } from "@/lib/hooks/use-funnel-stages";
import { useRenameStageById } from "@/lib/hooks/use-funnel-map";
import type { FunnelStage } from "@loyola-x/shared";

// ============================================================
// Constantes de layout
// ============================================================

const NODE_W = 288;
const NODE_H = 150;
/** Passo do snap. 16 é fino o bastante pra não brigar com o gesto e grosso o
 *  bastante pra alinhar sozinho — mesmo espírito do grid do Whimsical. */
const GRID = 16;
const COL_GAP = 120;
const ROW_GAP = 64;
const Z_MIN = 0.25;
const Z_MAX = 2.5;
const HIST_MAX = 60;

export interface CanvasState {
  nodes: Record<string, { x: number; y: number }>;
  edges: { from: string; to: string }[];
}

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Layout automático a partir do sortOrder, em cadeia — é como o time desenha
 * funil no quadro. Sem isso o primeiro acesso seria uma tela em branco com os
 * cards empilhados na origem.
 */
function autoLayout(stages: FunnelStage[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const porLinha = 4;
  stages.forEach((s, i) => {
    const col = i % porLinha;
    const row = Math.floor(i / porLinha);
    out[s.id] = { x: snap(col * (NODE_W + COL_GAP)), y: snap(row * (NODE_H + ROW_GAP)) };
  });
  return out;
}

/** Arestas implícitas da ordem, quando o funil nunca foi desenhado à mão. */
function autoEdges(stages: FunnelStage[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let i = 0; i < stages.length - 1; i++) out.push({ from: stages[i].id, to: stages[i + 1].id });
  return out;
}

/** Curva entre a saída (direita) de um nó e a entrada (esquerda) do outro. */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

type Gesto =
  | { tipo: "nenhum" }
  | { tipo: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { tipo: "mover"; sx: number; sy: number; base: Record<string, { x: number; y: number }> }
  | { tipo: "marquee"; ax: number; ay: number; bx: number; by: number }
  | { tipo: "ligar"; from: string; px: number; py: number };

interface Props {
  projectId: string;
  funnelId: string;
  stages: FunnelStage[];
  canvas: CanvasState | null | undefined;
  onPersist: (c: CanvasState) => void;
}

export function FunnelMapCanvas({ projectId, funnelId, stages, canvas, onPersist }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const criar = useCreateStage(projectId, funnelId);
  const remover = useDeleteStage(projectId, funnelId);
  const renomear = useRenameStageById(projectId, funnelId);

  // ---- Estado do desenho -------------------------------------------------
  const inicial = useMemo<CanvasState>(() => {
    const temNos = !!canvas?.nodes && Object.keys(canvas.nodes).length > 0;
    const nodes: Record<string, { x: number; y: number }> = temNos
      ? { ...canvas!.nodes }
      : autoLayout(stages);

    // Etapa criada depois do último desenho entra abaixo, nunca sobre a origem.
    let extra = 0;
    for (const s of stages) {
      if (!nodes[s.id]) {
        const maxY = Math.max(0, ...Object.values(nodes).map((n) => n.y));
        nodes[s.id] = { x: snap(extra * (NODE_W + COL_GAP)), y: snap(maxY + NODE_H + ROW_GAP) };
        extra++;
      }
    }

    const brutas = canvas?.edges?.length ? canvas.edges : temNos ? [] : autoEdges(stages);
    // Aresta apontando pra etapa deletada é lixo — filtra na leitura, em vez de
    // deixar a seta pendurada no vazio.
    const vivos = new Set(stages.map((s) => s.id));
    return { nodes, edges: brutas.filter((e) => vivos.has(e.from) && vivos.has(e.to)) };
  }, [stages, canvas]);

  const [estado, setEstado] = useState<CanvasState>(inicial);
  useEffect(() => setEstado(inicial), [inicial]);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 40, y: 40, z: 1 });
  const [gesto, setGesto] = useState<Gesto>({ tipo: "nenhum" });
  const [renomeando, setRenomeando] = useState<{ id: string; valor: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string | null } | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const [busca, setBusca] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string[] | null>(null);

  const espaco = useRef(false);
  const hist = useRef<{ past: CanvasState[]; future: CanvasState[] }>({ past: [], future: [] });
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const porId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // ---- Persistência ------------------------------------------------------
  const agendarPersist = useCallback(
    (c: CanvasState) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      // Arrastar emite dezenas de frames; só o repouso vira PUT.
      persistTimer.current = setTimeout(() => onPersist(c), 600);
    },
    [onPersist],
  );
  useEffect(() => () => { if (persistTimer.current) clearTimeout(persistTimer.current); }, []);

  /** Único ponto que muda o desenho — garante histórico e persistência. */
  const commit = useCallback(
    (proximo: CanvasState) => {
      setEstado((atual) => {
        hist.current.past.push(atual);
        if (hist.current.past.length > HIST_MAX) hist.current.past.shift();
        hist.current.future = [];
        return proximo;
      });
      agendarPersist(proximo);
    },
    [agendarPersist],
  );

  const desfazer = useCallback(() => {
    const anterior = hist.current.past.pop();
    if (!anterior) return;
    setEstado((atual) => {
      hist.current.future.push(atual);
      return anterior;
    });
    agendarPersist(anterior);
    toast.success("Desfeito");
  }, [agendarPersist]);

  const refazer = useCallback(() => {
    const proximo = hist.current.future.pop();
    if (!proximo) return;
    setEstado((atual) => {
      hist.current.past.push(atual);
      return proximo;
    });
    agendarPersist(proximo);
  }, [agendarPersist]);

  // ---- Conversão tela ↔ mundo -------------------------------------------
  const paraMundo = useCallback(
    (cx: number, cy: number) => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
    },
    [view],
  );

  const enquadrar = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    const pontos = Object.values(estado.nodes);
    if (!r || pontos.length === 0) return;
    const minX = Math.min(...pontos.map((p) => p.x));
    const minY = Math.min(...pontos.map((p) => p.y));
    const maxX = Math.max(...pontos.map((p) => p.x)) + NODE_W;
    const maxY = Math.max(...pontos.map((p) => p.y)) + NODE_H;
    const pad = 64;
    const z = clamp(
      Math.min((r.width - pad * 2) / Math.max(1, maxX - minX), (r.height - pad * 2) / Math.max(1, maxY - minY)),
      Z_MIN,
      1.2,
    );
    setView({
      x: r.width / 2 - ((minX + maxX) / 2) * z,
      y: r.height / 2 - ((minY + maxY) / 2) * z,
      z,
    });
  }, [estado.nodes]);

  const zoomEm = useCallback((fator: number, cx?: number, cy?: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = cx ?? r.left + r.width / 2;
    const py = cy ?? r.top + r.height / 2;
    setView((v) => {
      const zNovo = clamp(v.z * fator, Z_MIN, Z_MAX);
      // Mantém sob o cursor o mesmo ponto do mundo — zoom que "puxa" pro
      // ponteiro em vez de pro canto é o que faz parecer natural.
      const mx = (px - r.left - v.x) / v.z;
      const my = (py - r.top - v.y) / v.z;
      return { z: zNovo, x: px - r.left - mx * zNovo, y: py - r.top - my * zNovo };
    });
  }, []);

  // ---- Ações sobre etapas ------------------------------------------------
  const abrir = useCallback(
    (id: string) => router.push(`/projects/${projectId}/funnels/${funnelId}/stages/${id}`),
    [router, projectId, funnelId],
  );

  const duplicar = useCallback(() => {
    const alvos = [...sel];
    if (alvos.length === 0) return;
    alvos.forEach((id, i) => {
      const s = porId.get(id);
      if (!s) return;
      const base = estado.nodes[id] ?? { x: 0, y: 0 };
      criar.mutate(
        { name: `${s.name} (cópia)`, stageType: s.stageType as never },
        {
          onSuccess: (nova) => {
            commit({
              ...estado,
              nodes: {
                ...estado.nodes,
                [nova.id]: { x: snap(base.x + GRID * 2), y: snap(base.y + GRID * 2 + i * 8) },
              },
            });
            toast.success(`${nova.name} criada`);
          },
          onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao duplicar"),
        },
      );
    });
  }, [sel, porId, estado, criar, commit]);

  const apagar = useCallback(() => {
    const alvos = [...sel];
    if (alvos.length === 0) return;
    // O funil precisa sobrar com pelo menos uma etapa — mesma regra do card.
    if (alvos.length >= stages.length) {
      toast.error("O funil precisa de pelo menos uma etapa");
      return;
    }
    setConfirmar(alvos);
  }, [sel, stages.length]);

  const apagarConfirmado = useCallback(() => {
    const alvos = confirmar ?? [];
    setConfirmar(null);
    const restantes = { ...estado.nodes };
    for (const id of alvos) delete restantes[id];
    commit({
      nodes: restantes,
      edges: estado.edges.filter((e) => !alvos.includes(e.from) && !alvos.includes(e.to)),
    });
    setSel(new Set());
    alvos.forEach((id) =>
      remover.mutate(id, {
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
      }),
    );
    toast.success(alvos.length > 1 ? `${alvos.length} etapas removidas` : "Etapa removida");
  }, [confirmar, estado, commit, remover]);

  const confirmarRename = useCallback(() => {
    if (!renomeando) return;
    const nome = renomeando.valor.trim();
    const atual = porId.get(renomeando.id);
    const alvo = renomeando.id;
    setRenomeando(null);
    if (!nome || !atual || nome === atual.name) return;
    renomear.mutate(
      { stageId: alvo, name: nome },
      {
        onSuccess: () => toast.success("Etapa renomeada"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao renomear"),
      },
    );
  }, [renomeando, porId, renomear]);

  const alternarAresta = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      const existe = estado.edges.some((e) => e.from === from && e.to === to);
      commit({
        ...estado,
        edges: existe
          ? estado.edges.filter((e) => !(e.from === from && e.to === to))
          : [...estado.edges, { from, to }],
      });
    },
    [estado, commit],
  );

  // ---- Atalhos de teclado ------------------------------------------------
  useEffect(() => {
    function digitando(alvo: EventTarget | null): boolean {
      const el = alvo as HTMLElement | null;
      if (!el || !el.tagName) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (digitando(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === " ") {
        espaco.current = true;
        // Sem isto a barra rola a página enquanto se arrasta a tela.
        e.preventDefault();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel(new Set(stages.map((s) => s.id)));
        return;
      }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicar(); return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); setBusca(""); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomEm(1.2); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoomEm(1 / 1.2); return; }
      if (mod && e.key === "0") { e.preventDefault(); enquadrar(); return; }

      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); apagar(); return; }
      if (e.key === "Escape") { setSel(new Set()); setMenu(null); setAjuda(false); setBusca(null); return; }
      if (e.key === "?") { e.preventDefault(); setAjuda((v) => !v); return; }

      if (sel.size === 1) {
        const id = [...sel][0];
        if (e.key === "Enter") { e.preventDefault(); abrir(id); return; }
        if (e.key === "F2") {
          e.preventDefault();
          setRenomeando({ id, valor: porId.get(id)?.name ?? "" });
          return;
        }
      }

      // Setas movem a seleção pelo grid; com Shift, dez passos.
      if (sel.size > 0 && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const passo = (e.shiftKey ? 10 : 1) * GRID;
        const dx = e.key === "ArrowLeft" ? -passo : e.key === "ArrowRight" ? passo : 0;
        const dy = e.key === "ArrowUp" ? -passo : e.key === "ArrowDown" ? passo : 0;
        if (dx === 0 && dy === 0) return;
        const nodes = { ...estado.nodes };
        for (const id of sel) {
          const n = nodes[id];
          if (n) nodes[id] = { x: n.x + dx, y: n.y + dy };
        }
        commit({ ...estado, nodes });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") espaco.current = false;
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [sel, stages, estado, commit, desfazer, refazer, duplicar, apagar, abrir, enquadrar, zoomEm, porId]);

  // ---- Gestos de ponteiro ------------------------------------------------
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      zoomEm(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }

  function fundoPointerDown(e: React.PointerEvent) {
    if (e.button === 2) return;
    setMenu(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Botão do meio ou Space = mover a tela, como em qualquer editor de canvas.
    if (e.button === 1 || espaco.current) {
      setGesto({ tipo: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    const m = paraMundo(e.clientX, e.clientY);
    if (!e.shiftKey) setSel(new Set());
    setGesto({ tipo: "marquee", ax: m.x, ay: m.y, bx: m.x, by: m.y });
  }

  function noPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    setMenu(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const proxima = new Set(sel);
    if (e.shiftKey) {
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
    } else if (!proxima.has(id)) {
      proxima.clear();
      proxima.add(id);
    }
    setSel(proxima);
    setGesto({ tipo: "mover", sx: e.clientX, sy: e.clientY, base: { ...estado.nodes } });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (gesto.tipo === "nenhum") return;
    if (gesto.tipo === "pan") {
      setView((v) => ({ ...v, x: gesto.vx + (e.clientX - gesto.sx), y: gesto.vy + (e.clientY - gesto.sy) }));
      return;
    }
    if (gesto.tipo === "marquee") {
      const m = paraMundo(e.clientX, e.clientY);
      setGesto({ ...gesto, bx: m.x, by: m.y });
      return;
    }
    if (gesto.tipo === "ligar") {
      const m = paraMundo(e.clientX, e.clientY);
      setGesto({ ...gesto, px: m.x, py: m.y });
      return;
    }
    if (gesto.tipo === "mover") {
      const dx = (e.clientX - gesto.sx) / view.z;
      const dy = (e.clientY - gesto.sy) / view.z;
      const nodes = { ...estado.nodes };
      for (const id of sel) {
        const b = gesto.base[id];
        if (b) nodes[id] = { x: snap(b.x + dx), y: snap(b.y + dy) };
      }
      // Durante o arraste é setState direto: cada frame no histórico encheria a
      // pilha de undo com 60 entradas por gesto. O commit vem no pointerup.
      setEstado((a) => ({ ...a, nodes }));
    }
  }

  function onPointerUp() {
    if (gesto.tipo === "marquee") {
      const x1 = Math.min(gesto.ax, gesto.bx);
      const x2 = Math.max(gesto.ax, gesto.bx);
      const y1 = Math.min(gesto.ay, gesto.by);
      const y2 = Math.max(gesto.ay, gesto.by);
      const pegos = stages
        .filter((s) => {
          const n = estado.nodes[s.id];
          if (!n) return false;
          return n.x < x2 && n.x + NODE_W > x1 && n.y < y2 && n.y + NODE_H > y1;
        })
        .map((s) => s.id);
      if (pegos.length) setSel((a) => new Set([...a, ...pegos]));
    }
    if (gesto.tipo === "mover") {
      // Um arraste inteiro = uma entrada de undo.
      commit({ ...estado });
    }
    setGesto({ tipo: "nenhum" });
  }

  // ---- Render ------------------------------------------------------------
  const encontrados = useMemo(() => {
    const t = (busca ?? "").trim().toLowerCase();
    if (!t) return null;
    return new Set(stages.filter((s) => s.name.toLowerCase().includes(t)).map((s) => s.id));
  }, [busca, stages]);

  const marquee =
    gesto.tipo === "marquee"
      ? {
          x: Math.min(gesto.ax, gesto.bx),
          y: Math.min(gesto.ay, gesto.by),
          w: Math.abs(gesto.bx - gesto.ax),
          h: Math.abs(gesto.by - gesto.ay),
        }
      : null;

  return (
    <div className="relative">
      {/* Barra de ferramentas */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div className="inline-flex items-center rounded-md border border-border/50 p-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomEm(1 / 1.2)} aria-label="Diminuir zoom">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[46px] text-center font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(view.z * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomEm(1.2)} aria-label="Aumentar zoom">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={enquadrar}>
          <Maximize2 className="h-3.5 w-3.5" />
          Enquadrar
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={desfazer} aria-label="Desfazer">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refazer} aria-label="Refazer">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1" />
        {busca !== null && (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setBusca(null); }}
              placeholder="Buscar etapa..."
              className="h-7 w-44 text-xs"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBusca(null)} aria-label="Fechar busca">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAjuda((v) => !v)}>
          <Keyboard className="h-3.5 w-3.5" />
          Atalhos
        </Button>
      </div>

      {/* Superfície */}
      <div
        ref={wrapRef}
        className="relative h-[min(72vh,760px)] w-full touch-none overflow-hidden rounded-xl border border-border/50 bg-muted/20"
        style={{
          cursor: gesto.tipo === "pan" ? "grabbing" : "default",
          // Grade que acompanha o zoom — a referência visual do snap.
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onWheel={onWheel}
        onPointerDown={fundoPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: null }); }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {/* Arestas */}
          <svg className="pointer-events-none absolute overflow-visible" width="1" height="1" aria-hidden="true">
            <defs>
              <marker
                id="fm-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" />
              </marker>
            </defs>
            {estado.edges.map((e) => {
              const a = estado.nodes[e.from];
              const b = estado.nodes[e.to];
              if (!a || !b) return null;
              const ativa = sel.has(e.from) || sel.has(e.to);
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={ativa ? "var(--color-primary)" : "var(--color-muted-foreground)"}
                  strokeOpacity={ativa ? 0.9 : 0.4}
                  strokeWidth={2}
                  markerEnd="url(#fm-arrow)"
                />
              );
            })}
            {gesto.tipo === "ligar" && estado.nodes[gesto.from] && (
              <path
                d={edgePath(estado.nodes[gesto.from], { x: gesto.px, y: gesto.py - NODE_H / 2 })}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
          </svg>

          {/* Nós */}
          {stages.map((s) => {
            const n = estado.nodes[s.id];
            if (!n) return null;
            const selecionado = sel.has(s.id);
            const apagado = encontrados !== null && !encontrados.has(s.id);
            return (
              <div
                key={s.id}
                className="group absolute"
                style={{ left: n.x, top: n.y, width: NODE_W, opacity: apagado ? 0.25 : 1 }}
                onPointerDown={(e) => noPointerDown(e, s.id)}
                onDoubleClick={(e) => { e.stopPropagation(); abrir(s.id); }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!sel.has(s.id)) setSel(new Set([s.id]));
                  setMenu({ x: e.clientX, y: e.clientY, id: s.id });
                }}
              >
                <div
                  className={`rounded-xl ring-offset-2 ring-offset-background transition-shadow ${
                    selecionado ? "ring-2 ring-primary" : "ring-0"
                  }`}
                >
                  {/* O card do design system, inerte: quem manda no gesto é o
                      wrapper. Assim o visual nunca diverge da grade. */}
                  <div className="pointer-events-none select-none">
                    <StageCard
                      stage={s}
                      projectId={projectId}
                      funnelId={funnelId}
                      isLastStage={stages.length === 1}
                    />
                  </div>
                </div>

                {/* Porta de saída — arrastar daqui cria a conexão. */}
                <button
                  type="button"
                  aria-label={`Conectar a partir de ${s.name}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const m = paraMundo(e.clientX, e.clientY);
                    setGesto({ tipo: "ligar", from: s.id, px: m.x, py: m.y });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (gesto.tipo === "ligar" && gesto.from !== s.id) alternarAresta(gesto.from, s.id);
                    setGesto({ tipo: "nenhum" });
                  }}
                  className={`absolute -right-2 top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground/50 transition-opacity hover:bg-primary focus-visible:opacity-100 group-hover:opacity-100 ${
                    selecionado || gesto.tipo === "ligar" ? "opacity-100" : "opacity-0"
                  }`}
                />
                {/* Alvo de entrada: soltar aqui fecha a conexão. */}
                <div
                  aria-hidden="true"
                  className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full"
                  onPointerUp={(e) => {
                    if (gesto.tipo === "ligar" && gesto.from !== s.id) {
                      e.stopPropagation();
                      alternarAresta(gesto.from, s.id);
                      setGesto({ tipo: "nenhum" });
                    }
                  }}
                  style={{
                    background:
                      gesto.tipo === "ligar" && gesto.from !== s.id ? "var(--color-primary)" : "transparent",
                  }}
                />

                {renomeando?.id === s.id && (
                  <div className="absolute inset-x-3 top-3 z-20">
                    <Input
                      autoFocus
                      value={renomeando.valor}
                      onChange={(ev) => setRenomeando({ id: s.id, valor: ev.target.value })}
                      onBlur={confirmarRename}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") { ev.preventDefault(); confirmarRename(); }
                        if (ev.key === "Escape") { ev.preventDefault(); setRenomeando(null); }
                      }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Seleção por área */}
          {marquee && (
            <div
              className="pointer-events-none absolute border border-primary bg-primary/10"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>

        <Minimapa nodes={estado.nodes} sel={sel} />

        <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground">
          {sel.size > 0 ? `${sel.size} selecionada${sel.size > 1 ? "s" : ""}` : `${stages.length} etapas`}
          {" · "}Space + arraste move a tela
        </div>
      </div>

      {/* Menu de contexto */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} />
          <div
            className="fixed z-50 min-w-[190px] overflow-hidden rounded-lg border border-border/60 bg-popover py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.id ? (
              <>
                <ItemMenu icon={ExternalLink} label="Abrir etapa" atalho="Enter" onClick={() => { abrir(menu.id!); setMenu(null); }} />
                <ItemMenu
                  icon={Pencil}
                  label="Renomear"
                  atalho="F2"
                  onClick={() => { setRenomeando({ id: menu.id!, valor: porId.get(menu.id!)?.name ?? "" }); setMenu(null); }}
                />
                <ItemMenu icon={Copy} label="Duplicar" atalho="⌘D" onClick={() => { duplicar(); setMenu(null); }} />
                <ItemMenu
                  icon={Unlink}
                  label="Remover conexões"
                  onClick={() => {
                    commit({ ...estado, edges: estado.edges.filter((e) => e.from !== menu.id && e.to !== menu.id) });
                    setMenu(null);
                  }}
                />
                <div className="my-1 h-px bg-border/60" />
                <ItemMenu icon={Trash2} label="Remover etapa" atalho="Del" destrutivo onClick={() => { apagar(); setMenu(null); }} />
              </>
            ) : (
              <>
                <ItemMenu icon={Maximize2} label="Enquadrar tudo" atalho="⌘0" onClick={() => { enquadrar(); setMenu(null); }} />
                <ItemMenu icon={Link2} label="Religar em cadeia" onClick={() => { commit({ ...estado, edges: autoEdges(stages) }); setMenu(null); }} />
                <ItemMenu
                  icon={Maximize2}
                  label="Reorganizar layout"
                  onClick={() => { commit({ nodes: autoLayout(stages), edges: estado.edges }); setMenu(null); }}
                />
              </>
            )}
          </div>
        </>
      )}

      {ajuda && <PainelAtalhos onClose={() => setAjuda(false)} />}

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover {confirmar?.length === 1 ? "a etapa" : `${confirmar?.length} etapas`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.map((id) => porId.get(id)?.name).filter(Boolean).join(", ")} será removid
              {confirmar?.length === 1 ? "a" : "as"} permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={apagarConfirmado}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Peças auxiliares
// ============================================================

function ItemMenu({
  icon: Icon,
  label,
  atalho,
  onClick,
  destrutivo,
}: {
  icon: typeof Trash2;
  label: string;
  atalho?: string;
  onClick: () => void;
  destrutivo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
        destrutivo ? "text-destructive" : ""
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {atalho && <span className="font-mono text-[10px] text-muted-foreground">{atalho}</span>}
    </button>
  );
}

/** Visão geral do desenho — só aparece quando há mais de um nó. */
function Minimapa({ nodes, sel }: { nodes: Record<string, { x: number; y: number }>; sel: Set<string> }) {
  const pontos = Object.entries(nodes);
  if (pontos.length < 2) return null;
  const xs = pontos.map(([, p]) => p.x);
  const ys = pontos.map(([, p]) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) + NODE_W - minX);
  const h = Math.max(1, Math.max(...ys) + NODE_H - minY);
  const W = 132;
  const H = Math.max(40, Math.min(96, (h / w) * W));
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-border/50 bg-background/85 p-1 backdrop-blur">
      <svg width={W} height={H} aria-hidden="true">
        {pontos.map(([id, p]) => (
          <rect
            key={id}
            x={((p.x - minX) / w) * W}
            y={((p.y - minY) / h) * H}
            width={Math.max(3, (NODE_W / w) * W)}
            height={Math.max(2, (NODE_H / h) * H)}
            rx={1.5}
            fill={sel.has(id) ? "var(--color-primary)" : "var(--color-muted-foreground)"}
            fillOpacity={sel.has(id) ? 0.9 : 0.35}
          />
        ))}
      </svg>
    </div>
  );
}

const ATALHOS: { grupo: string; itens: [string, string][] }[] = [
  {
    grupo: "Seleção",
    itens: [
      ["Clique", "Seleciona a etapa"],
      ["Shift + clique", "Adiciona à seleção"],
      ["Arrastar no vazio", "Seleção por área"],
      ["⌘A", "Seleciona tudo"],
      ["Esc", "Limpa a seleção"],
    ],
  },
  {
    grupo: "Edição",
    itens: [
      ["Enter", "Abre a etapa"],
      ["Duplo clique", "Abre a etapa"],
      ["F2", "Renomeia no lugar"],
      ["⌘D", "Duplica"],
      ["Del", "Remove"],
      ["⌘Z / ⇧⌘Z", "Desfaz / refaz"],
      ["Setas", "Move 16px (Shift = 160px)"],
    ],
  },
  {
    grupo: "Navegação",
    itens: [
      ["Space + arraste", "Move a tela"],
      ["Botão do meio", "Move a tela"],
      ["⌘ + roda", "Zoom no cursor"],
      ["⌘+ / ⌘−", "Zoom"],
      ["⌘0", "Enquadra tudo"],
      ["⌘F", "Busca etapa"],
      ["?", "Este painel"],
    ],
  },
  {
    grupo: "Conexões",
    itens: [
      ["Arrastar da bolinha", "Cria conexão"],
      ["Arrastar sobre existente", "Remove a conexão"],
      ["Botão direito", "Menu de ações"],
    ],
  },
];

function PainelAtalhos({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-popover p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Atalhos do mapa</h3>
            <p className="text-[11px] text-muted-foreground">Tecle ? a qualquer momento pra abrir e fechar</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {ATALHOS.map((g) => (
            <div key={g.grupo}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.grupo}</p>
              <dl className="space-y-1">
                {g.itens.map(([tecla, oque]) => (
                  <div key={tecla} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0">
                      <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {tecla}
                      </kbd>
                    </dt>
                    <dd className="flex-1 text-right text-[11px] text-muted-foreground">{oque}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
