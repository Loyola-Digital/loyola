"use client";

/**
 * A camada de UX de canvas do Mapa do Funil — seleção múltipla, histórico e
 * zoom.
 *
 * Vive fora do componente porque são três máquinas de estado independentes do
 * que está sendo desenhado: elas não sabem o que é bloco nem conector, só
 * mexem em ids e num documento genérico. Isso mantém o canvas focado em
 * desenhar, e torna cada peça testável sozinha.
 */

import { useCallback, useMemo, useRef, useState } from "react";

// ============================================================
// Histórico (desfazer/refazer)
// ============================================================

const HIST_MAX = 60;

export interface Historico<T> {
  /** Guarda o estado ANTES da mudança. Chamar antes de aplicar. */
  registrar: (anterior: T) => void;
  desfazer: (atual: T) => T | null;
  refazer: (atual: T) => T | null;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  limpar: () => void;
}

export function useHistorico<T>(): Historico<T> {
  const pilhas = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] });
  // Só existe pra forçar re-render quando os botões precisam habilitar/
  // desabilitar — a verdade continua nos refs, que não disparam render por si.
  const [, forcar] = useState(0);

  const registrar = useCallback((anterior: T) => {
    pilhas.current.past.push(anterior);
    if (pilhas.current.past.length > HIST_MAX) pilhas.current.past.shift();
    // Ramo novo invalida o futuro: refazer depois de editar levaria a um estado
    // que nunca existiu nesta linha do tempo.
    pilhas.current.future = [];
    forcar((n) => n + 1);
  }, []);

  const desfazer = useCallback((atual: T): T | null => {
    const anterior = pilhas.current.past.pop();
    if (anterior === undefined) return null;
    pilhas.current.future.push(atual);
    forcar((n) => n + 1);
    return anterior;
  }, []);

  const refazer = useCallback((atual: T): T | null => {
    const proximo = pilhas.current.future.pop();
    if (proximo === undefined) return null;
    pilhas.current.past.push(atual);
    forcar((n) => n + 1);
    return proximo;
  }, []);

  const limpar = useCallback(() => {
    pilhas.current = { past: [], future: [] };
    forcar((n) => n + 1);
  }, []);

  return {
    registrar,
    desfazer,
    refazer,
    podeDesfazer: pilhas.current.past.length > 0,
    podeRefazer: pilhas.current.future.length > 0,
    limpar,
  };
}

// ============================================================
// Seleção múltipla
// ============================================================

export interface Selecao {
  ids: Set<string>;
  tem: (id: string) => boolean;
  /** Id único selecionado, ou null quando são zero ou vários. */
  unico: string | null;
  definir: (ids: string[]) => void;
  alternar: (id: string) => void;
  /** Clique num bloco: sem Shift substitui, com Shift alterna. */
  clicar: (id: string, comShift: boolean) => void;
  somar: (ids: string[]) => void;
  limpar: () => void;
}

export function useSelecao(): Selecao {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const definir = useCallback((novos: string[]) => setIds(new Set(novos)), []);
  const limpar = useCallback(() => setIds(new Set()), []);
  const somar = useCallback((novos: string[]) => {
    if (novos.length === 0) return;
    setIds((a) => new Set([...a, ...novos]));
  }, []);
  const alternar = useCallback((id: string) => {
    setIds((a) => {
      const p = new Set(a);
      if (p.has(id)) p.delete(id);
      else p.add(id);
      return p;
    });
  }, []);
  const clicar = useCallback((id: string, comShift: boolean) => {
    setIds((a) => {
      if (comShift) {
        const p = new Set(a);
        if (p.has(id)) p.delete(id);
        else p.add(id);
        return p;
      }
      // Clicar num item já selecionado NÃO derruba o resto: senão arrastar um
      // grupo pelo primeiro bloco desfaria a seleção antes de mover.
      if (a.has(id)) return a;
      return new Set([id]);
    });
  }, []);

  const unico = useMemo(() => (ids.size === 1 ? [...ids][0] : null), [ids]);
  const tem = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, tem, unico, definir, alternar, clicar, somar, limpar };
}

// ============================================================
// Zoom
// ============================================================

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2;
const PASSO = 1.2;

export interface Zoom {
  valor: number;
  aumentar: () => void;
  diminuir: () => void;
  /** Ajusta pra caber `conteudo` dentro de `area`, sem passar de 100%. */
  enquadrar: (conteudo: { w: number; h: number }, area: { w: number; h: number }) => void;
  reset: () => void;
  aplicar: (fator: number) => void;
}

export function useZoom(): Zoom {
  const [valor, setValor] = useState(1);
  const limitar = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));

  return {
    valor,
    aumentar: useCallback(() => setValor((v) => limitar(v * PASSO)), []),
    diminuir: useCallback(() => setValor((v) => limitar(v / PASSO)), []),
    aplicar: useCallback((fator: number) => setValor((v) => limitar(v * fator)), []),
    reset: useCallback(() => setValor(1), []),
    enquadrar: useCallback((conteudo, area) => {
      if (conteudo.w <= 0 || conteudo.h <= 0) return;
      // Nunca passa de 1: ampliar um mapa de três blocos até encher a tela
      // deixaria os cards gigantes e ilegíveis.
      setValor(limitar(Math.min(area.w / conteudo.w, area.h / conteudo.h, 1)));
    }, []),
  };
}

// ============================================================
// Grade
// ============================================================

/** Mesmo passo do fundo pontilhado do canvas — o snap tem que casar com o que
 *  a pessoa vê, senão parece que o bloco "escorrega" sozinho. */
export const GRADE = 20;
export const snap = (v: number) => Math.round(v / GRADE) * GRADE;
