"use client";

/**
 * O calendário mensal — a linguagem visual do Google Calendar.
 *
 * A estrutura vem do planner original, medida no CSS dele: cabeçalho dos dias
 * em 10,5px com letter-spacing, número do dia centralizado num círculo de 22px,
 * barras de 18px com 11,5px de fonte. O que muda são os tokens — `bg-card`,
 * `border-border`, `text-muted-foreground` no lugar dos hex fixos, para o tema
 * do app valer aqui também.
 *
 * ## Barras que atravessam semanas
 *
 * Uma fase de 21 dias vira três barras, uma por linha. Cada segmento sabe se é
 * o primeiro e/ou o último: as pontas internas ficam com raio 1px e as externas
 * com 4px, então a fase parece uma coisa só que continua na linha de baixo.
 *
 * ## Faixas congeladas durante o arrasto
 *
 * A altura da semana depende de quantas faixas ela usa. Recalcular isso durante
 * o gesto faria a linha pular debaixo do cursor e a barra escapar.
 */

import { useMemo, useRef, useState } from "react";
import {
  MESES_CURTOS,
  br,
  corDoTexto,
  dias,
  emFaixas,
  hojeIso,
  paraIso,
  somarDias,
  type Campanha,
  type Fase,
} from "@/lib/planner/datas";

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/* Medidas do original: barra de 18px empilhada de 20 em 20, sob 26px de dia. */
const ALTURA_BARRA = 18;
const PASSO_FAIXA = 20;
const ALTURA_DO_DIA = 26;

interface Arrasto {
  campanhaId: string;
  faseId: string;
  modo: "mover" | "inicio" | "fim";
  celulaInicial: number;
  startOriginal: string;
  endOriginal: string;
}

export function Calendario({
  campanhas,
  ano,
  mes,
  faseSelecionada,
  onSelecionarFase,
  onMudarFase,
}: {
  campanhas: Campanha[];
  ano: number;
  mes: number;
  faseSelecionada: string | null;
  onSelecionarFase: (campanhaId: string, faseId: string) => void;
  onMudarFase: (campanhaId: string, fase: Fase) => void;
}) {
  const gradeRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [delta, setDelta] = useState(0);
  const hoje = hojeIso();

  const { primeiroDia, semanas } = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1, 12);
    const nDias = new Date(ano, mes, 0).getDate();
    const inicio = new Date(primeiro);
    inicio.setDate(inicio.getDate() - primeiro.getDay());
    return { primeiroDia: inicio, semanas: Math.ceil((primeiro.getDay() + nDias) / 7) };
  }, [ano, mes]);

  const celulas = useMemo(() => {
    const saida: string[] = [];
    for (let i = 0; i < semanas * 7; i++) {
      const d = new Date(primeiroDia);
      d.setDate(d.getDate() + i);
      saida.push(paraIso(d));
    }
    return saida;
  }, [primeiroDia, semanas]);

  /** As fases visíveis, já com o arrasto aplicado, empilhadas em faixas. */
  const barras = useMemo(() => {
    const itens: { campanha: Campanha; fase: Fase }[] = [];
    for (const c of campanhas) {
      for (const f of c.phases) {
        if (!f.start) continue;
        if (arrasto?.faseId !== f.id) {
          itens.push({ campanha: c, fase: f });
          continue;
        }
        const { modo, startOriginal, endOriginal } = arrasto;
        let start = startOriginal;
        let end = endOriginal;
        if (modo === "mover") {
          start = somarDias(startOriginal, delta);
          end = endOriginal ? somarDias(endOriginal, delta) : "";
        } else if (modo === "inicio") {
          start = somarDias(startOriginal, delta);
          // Redimensionar nunca inverte.
          if (end && start > end) start = end;
        } else {
          end = somarDias(endOriginal || startOriginal, delta);
          if (end < start) end = start;
        }
        itens.push({ campanha: c, fase: { ...f, start, end } });
      }
    }
    return emFaixas(itens);
  }, [campanhas, arrasto, delta]);

  const faixasPorSemana = useMemo(() => {
    const contagem = new Array(semanas).fill(1);
    for (const b of barras) {
      for (let s = 0; s < semanas; s++) {
        if (b.start <= celulas[s * 7 + 6]! && b.fim >= celulas[s * 7]!) {
          contagem[s] = Math.max(contagem[s], b.faixa + 1);
        }
      }
    }
    return contagem;
  }, [barras, celulas, semanas]);

  const congelado = useRef<number[] | null>(null);
  const alturas = arrasto ? (congelado.current ?? faixasPorSemana) : faixasPorSemana;

  const alturaDaSemana = (s: number) =>
    ALTURA_DO_DIA + Math.max(alturas[s]!, 1) * PASSO_FAIXA + 6;

  /** A célula sob o ponteiro; se soltar fora, a mais próxima. */
  function celulaSob(clientX: number, clientY: number): number {
    const grade = gradeRef.current;
    if (!grade) return -1;
    const r = grade.getBoundingClientRect();
    const col = Math.max(0, Math.min(6, Math.floor(((clientX - r.left) / r.width) * 7)));
    let y = r.top;
    for (let s = 0; s < semanas; s++) {
      const h = alturaDaSemana(s);
      if (clientY < y + h || s === semanas - 1) return s * 7 + col;
      y += h;
    }
    return col;
  }

  function iniciar(e: React.PointerEvent, c: Campanha, f: Fase, modo: Arrasto["modo"]) {
    e.preventDefault();
    e.stopPropagation();
    congelado.current = faixasPorSemana;
    setArrasto({
      campanhaId: c.id,
      faseId: f.id,
      modo,
      celulaInicial: celulaSob(e.clientX, e.clientY),
      startOriginal: f.start,
      endOriginal: f.end,
    });
    setDelta(0);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function soltar() {
    if (!arrasto) return;
    const barra = barras.find((b) => b.fase.id === arrasto.faseId);
    // Delta zero é clique, não arrasto: seleciona em vez de gravar.
    if (delta === 0) onSelecionarFase(arrasto.campanhaId, arrasto.faseId);
    else if (barra) onMudarFase(arrasto.campanhaId, barra.fase);
    setArrasto(null);
    setDelta(0);
    congelado.current = null;
  }

  return (
    <div className="flex min-h-full flex-col overflow-x-auto bg-card">
      <div className="min-w-[520px] flex-1">
        <div className="sticky top-0 z-[6] grid grid-cols-7 bg-card">
          {DIAS_DA_SEMANA.map((d) => (
            <div
              key={d}
              className="px-0 pb-[7px] pt-[9px] text-center text-[10.5px] font-medium uppercase tracking-[0.9px] text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div
          ref={gradeRef}
          onPointerMove={(e) => {
            if (!arrasto) return;
            const atual = celulaSob(e.clientX, e.clientY);
            if (atual >= 0) setDelta(atual - arrasto.celulaInicial);
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          className="select-none"
          style={{ touchAction: arrasto ? "none" : undefined }}
        >
          {Array.from({ length: semanas }, (_, s) => (
            <div
              key={s}
              className="relative border-t border-border last:border-b"
              style={{ height: alturaDaSemana(s) }}
            >
              <div className="absolute inset-0 grid grid-cols-7">
                {Array.from({ length: 7 }, (_, c) => {
                  const iso = celulas[s * 7 + c]!;
                  const doMes = Number(iso.slice(5, 7)) === mes;
                  const fimDeSemana = c === 0 || c === 6;
                  const ehHoje = iso === hoje;
                  const dia = Number(iso.slice(8, 10));
                  return (
                    <div
                      key={c}
                      className={`border-r border-border last:border-r-0 ${
                        fimDeSemana ? "bg-foreground/[0.025]" : ""
                      }`}
                    >
                      <div
                        className={`pt-1 text-center text-[12px] leading-none tabular-nums ${
                          doMes ? "text-foreground/80" : "text-muted-foreground opacity-55"
                        }`}
                      >
                        <span
                          className={`inline-block h-[22px] min-w-[22px] rounded-full px-[3px] leading-[22px] ${
                            ehHoje
                              ? "bg-[#1a73e8] font-medium text-white dark:bg-[#8ab4f8] dark:text-[#0D0F13]"
                              : ""
                          }`}
                        >
                          {dia}
                        </span>
                        {/* O dia 1 traz o mês: numa grade que começa no domingo
                            anterior, sem isso não se vê onde o mês vira. */}
                        {dia === 1 && (
                          <span className="ml-px text-[10px] opacity-70">
                            {MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {barras.map((b) => {
                const iniSemana = celulas[s * 7]!;
                const fimSemana = celulas[s * 7 + 6]!;
                if (b.start > fimSemana || b.fim < iniSemana) return null;

                const de = b.start > iniSemana ? b.start : iniSemana;
                const ate = b.fim < fimSemana ? b.fim : fimSemana;
                const col = dias(iniSemana, de);
                const span = dias(de, ate) + 1;
                const primeiro = b.start >= iniSemana;
                const ultimo = b.fim <= fimSemana;
                const aberta = !b.fase.end;
                const arrastando = arrasto?.faseId === b.fase.id;

                return (
                  <div
                    key={`${b.fase.id}-${s}`}
                    onPointerDown={(e) => iniciar(e, b.campanha, b.fase, "mover")}
                    title={`${b.fase.name} · ${b.campanha.name}\n${br(b.start)} → ${
                      b.fase.end ? br(b.fim) : "em aberto"
                    }`}
                    className={`absolute flex cursor-pointer select-none items-center gap-[5px] overflow-hidden whitespace-nowrap px-1.5 text-[11.5px] font-medium leading-[18px] transition-[filter] hover:brightness-110 active:cursor-grabbing ${
                      arrastando ? "z-40 cursor-grabbing brightness-110 shadow-lg" : "z-10"
                    } ${faseSelecionada === b.fase.id ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                    style={{
                      left: `calc(${(col / 7) * 100}% + 2px)`,
                      width: `calc(${(span / 7) * 100}% - 4px)`,
                      top: ALTURA_DO_DIA + b.faixa * PASSO_FAIXA,
                      height: ALTURA_BARRA,
                      backgroundColor: b.campanha.color,
                      color: corDoTexto(b.campanha.color),
                      // Pontas internas com 1px, externas com 4px: a fase parece
                      // uma coisa só que continua na linha de baixo.
                      borderRadius: `${primeiro ? 4 : 1}px ${ultimo ? 4 : 1}px ${
                        ultimo ? 4 : 1
                      }px ${primeiro ? 4 : 1}px`,
                      borderRight:
                        aberta && ultimo
                          ? "2px dashed color-mix(in srgb, currentColor 60%, transparent)"
                          : undefined,
                    }}
                  >
                    {primeiro && (
                      <>
                        <span
                          onPointerDown={(e) => iniciar(e, b.campanha, b.fase, "inicio")}
                          className="absolute bottom-0 left-0 top-0 z-[2] w-[7px] cursor-ew-resize"
                          aria-hidden
                        />
                        <span className="hidden flex-none text-[10.5px] font-normal opacity-80 sm:inline">
                          {b.start.slice(8, 10)}/{b.start.slice(5, 7)}
                        </span>
                      </>
                    )}
                    <span className="overflow-hidden text-ellipsis">{b.fase.name}</span>
                    <span className="hidden overflow-hidden text-ellipsis font-normal opacity-[0.72] md:inline">
                      · {b.campanha.name}
                    </span>
                    {ultimo && !aberta && (
                      <span
                        onPointerDown={(e) => iniciar(e, b.campanha, b.fase, "fim")}
                        className="absolute bottom-0 right-0 top-0 z-[2] w-[7px] cursor-ew-resize"
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
