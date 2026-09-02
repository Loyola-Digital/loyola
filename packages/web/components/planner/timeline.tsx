"use client";

/**
 * A timeline — o ano inteiro numa tela.
 *
 * O calendário mostra um mês por vez e responde "o que acontece nesta semana".
 * A timeline responde a outra pergunta: "os lançamentos estão espremidos?".
 * Só se vê sobreposição entre campanhas olhando todas na mesma régua.
 *
 * Escala fixa de 22px por dia. Fixa e não adaptável de propósito: a mesma
 * distância significa a mesma coisa quando se compara duas telas, e um zoom
 * automático faria uma semana parecer maior num mês vazio.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MESES_CURTOS,
  br,
  corDoTexto,
  dias,
  emFaixas,
  hojeIso,
  paraData,
  paraIso,
  periodo,
  somarDias,
  type Campanha,
  type Fase,
} from "@/lib/planner/datas";

const PX_POR_DIA = 22;
const ALTURA_BARRA = 24;
const LARGURA_ROTULO = 170;

export function Timeline({
  campanhas,
  faseSelecionada,
  onSelecionarFase,
  onMudarFase,
}: {
  campanhas: Campanha[];
  faseSelecionada: string | null;
  onSelecionarFase: (campanhaId: string, faseId: string) => void;
  onMudarFase: (campanhaId: string, fase: Fase) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<{
    campanhaId: string;
    faseId: string;
    modo: "mover" | "inicio" | "fim";
    x0: number;
    start: string;
    end: string;
  } | null>(null);
  const [delta, setDelta] = useState(0);

  const hoje = hojeIso();

  /** O intervalo desenhado: do primeiro ao último dia, em meses cheios. */
  const faixa = useMemo(() => {
    const todas = campanhas.flatMap((c) => c.phases);
    const p = periodo(todas);
    const base = p ?? { inicio: hoje, fim: hoje };
    const ini = paraData(base.inicio);
    const fim = paraData(base.fim);
    // Mês cheio nas duas pontas: uma régua que começa no dia 17 não deixa
    // comparar meses de relance.
    return {
      inicio: paraIso(new Date(ini.getFullYear(), ini.getMonth(), 1, 12)),
      fim: paraIso(new Date(fim.getFullYear(), fim.getMonth() + 1, 0, 12)),
    };
  }, [campanhas, hoje]);

  const totalDias = dias(faixa.inicio, faixa.fim) + 1;
  const largura = totalDias * PX_POR_DIA;

  /** Os meses do cabeçalho, com a largura proporcional aos dias de cada um. */
  const meses = useMemo(() => {
    const saida: { rotulo: string; esquerda: number; largura: number }[] = [];
    let cursor = faixa.inicio;
    while (cursor <= faixa.fim) {
      const d = paraData(cursor);
      const ultimoDoMes = paraIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
      const fim = ultimoDoMes < faixa.fim ? ultimoDoMes : faixa.fim;
      saida.push({
        rotulo: `${MESES_CURTOS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        esquerda: dias(faixa.inicio, cursor) * PX_POR_DIA,
        largura: (dias(cursor, fim) + 1) * PX_POR_DIA,
      });
      cursor = somarDias(fim, 1);
    }
    return saida;
  }, [faixa]);

  // Abre no dia de hoje: o passado distante raramente é o que se quer ver.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, dias(faixa.inicio, hoje) * PX_POR_DIA - 200);
  }, [faixa.inicio, hoje]);

  function soltar() {
    if (!arrasto) return;
    if (delta !== 0) {
      const c = campanhas.find((x) => x.id === arrasto.campanhaId);
      const f = c?.phases.find((x) => x.id === arrasto.faseId);
      if (f) {
        let start = arrasto.start;
        let end = arrasto.end;
        if (arrasto.modo === "mover") {
          start = somarDias(start, delta);
          end = end ? somarDias(end, delta) : "";
        } else if (arrasto.modo === "inicio") {
          start = somarDias(start, delta);
          if (end && start > end) start = end;
        } else {
          end = somarDias(end || start, delta);
          if (end < start) end = start;
        }
        onMudarFase(arrasto.campanhaId, { ...f, start, end });
      }
    } else {
      onSelecionarFase(arrasto.campanhaId, arrasto.faseId);
    }
    setArrasto(null);
    setDelta(0);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        onPointerMove={(e) => {
          if (!arrasto) return;
          setDelta(Math.round((e.clientX - arrasto.x0) / PX_POR_DIA));
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        style={{ touchAction: arrasto ? "none" : undefined }}
      >
        <div style={{ width: LARGURA_ROTULO + largura, minWidth: "100%" }}>
          <div className="sticky top-0 z-20 flex border-b border-border/50 bg-card">
            <div
              className="shrink-0 border-r border-border/50 px-2 py-1.5 text-[10px] uppercase text-muted-foreground"
              style={{ width: LARGURA_ROTULO }}
            >
              Campanha
            </div>
            <div className="relative" style={{ width: largura }}>
              {meses.map((m) => (
                <div
                  key={m.rotulo}
                  className="absolute top-0 border-r border-border/40 py-1.5 pl-1 text-[10px] uppercase text-muted-foreground"
                  style={{ left: m.esquerda, width: m.largura }}
                >
                  {m.rotulo}
                </div>
              ))}
            </div>
          </div>

          {campanhas.map((c) => {
            const barras = emFaixas(c.phases.map((f) => ({ campanha: c, fase: f })));
            const nFaixas = Math.max(...barras.map((b) => b.faixa + 1), 1);
            return (
              <div key={c.id} className="flex border-b border-border/30 last:border-0">
                <div
                  className="shrink-0 border-r border-border/50 px-2 py-2"
                  style={{ width: LARGURA_ROTULO }}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                  </span>
                </div>

                <div
                  className="relative"
                  style={{ width: largura, height: 8 + nFaixas * ALTURA_BARRA }}
                >
                  {/* Marcador de hoje: a referência que dá sentido a "estamos
                      atrasados" sem precisar contar dias na régua. */}
                  {hoje >= faixa.inicio && hoje <= faixa.fim && (
                    <span
                      className="pointer-events-none absolute top-0 z-10 h-full w-px bg-[#1a73e8]"
                      style={{ left: dias(faixa.inicio, hoje) * PX_POR_DIA + PX_POR_DIA / 2 }}
                      aria-hidden
                    />
                  )}

                  {barras.map((b) => {
                    const arrastando = arrasto?.faseId === b.fase.id;
                    const d = arrastando ? delta : 0;
                    const start = arrastando && arrasto.modo !== "fim" ? somarDias(b.start, d) : b.start;
                    const fim = arrastando && arrasto.modo !== "inicio" ? somarDias(b.fim, d) : b.fim;
                    const esquerda = dias(faixa.inicio, start) * PX_POR_DIA;
                    const larguraBarra = Math.max((dias(start, fim) + 1) * PX_POR_DIA - 2, 8);

                    return (
                      <div
                        key={b.fase.id}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          // 7px das bordas redimensiona; o meio move.
                          const modo =
                            e.clientX - r.left < 7
                              ? "inicio"
                              : r.right - e.clientX < 7 && b.fase.end
                                ? "fim"
                                : "mover";
                          setArrasto({
                            campanhaId: c.id,
                            faseId: b.fase.id,
                            modo,
                            x0: e.clientX,
                            start: b.fase.start,
                            end: b.fase.end,
                          });
                          setDelta(0);
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                        }}
                        title={`${b.fase.name}\n${br(b.start)} → ${b.fase.end ? br(b.fim) : "em aberto"}`}
                        className={`absolute flex cursor-grab items-center gap-1 overflow-hidden rounded px-1.5 text-[10px] leading-none ${
                          arrastando ? "z-20 cursor-grabbing shadow-lg" : ""
                        } ${faseSelecionada === b.fase.id ? "ring-2 ring-primary ring-offset-1" : ""}`}
                        style={{
                          left: esquerda,
                          width: larguraBarra,
                          top: 4 + b.faixa * ALTURA_BARRA,
                          height: ALTURA_BARRA - 6,
                          backgroundColor: c.color,
                          color: corDoTexto(c.color),
                          borderRight: !b.fase.end
                            ? "2px dashed rgba(255,255,255,.6)"
                            : undefined,
                        }}
                      >
                        <span className="truncate font-medium">{b.fase.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
