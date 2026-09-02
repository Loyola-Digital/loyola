"use client";

/**
 * O calendário mensal — a visão principal.
 *
 * ## O que ele resolve
 *
 * A tabela de cards responde "quando é a fase X". Só o calendário responde a
 * pergunta que trava um planejamento: "o que mais está acontecendo nesta
 * semana?". É por isso que ele é o padrão.
 *
 * ## Barras que atravessam semanas
 *
 * Uma fase de 21 dias não é uma barra: são três, uma por linha da grade. Cada
 * segmento sabe se é o primeiro e/ou o último, e só arredonda as pontas
 * externas — assim a fase parece uma coisa só que continua na linha de baixo,
 * em vez de três blocos soltos.
 *
 * ## Faixas congeladas durante o arrasto
 *
 * A altura de cada semana depende de quantas faixas ela usa. Se isso for
 * recalculado enquanto o dedo está na tela, a linha pula de altura debaixo do
 * cursor e a barra escapa. Durante o arrasto a contagem fica congelada no que
 * era antes de começar.
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

/** Altura de uma barra, e o espaço do cabeçalho do dia. */
const ALTURA_BARRA = 20;
const ALTURA_CABECALHO = 26;

interface Arrasto {
  campanhaId: string;
  faseId: string;
  modo: "mover" | "inicio" | "fim";
  /** Índice da célula onde o gesto começou. */
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
  /** Deslocamento em dias durante o gesto — some ao soltar. */
  const [delta, setDelta] = useState(0);

  const hoje = hojeIso();

  /** O primeiro domingo da grade e quantas semanas ela tem. */
  const { primeiroDia, semanas, diasNoMes } = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1, 12);
    const nDias = new Date(ano, mes, 0).getDate();
    const inicio = new Date(primeiro);
    inicio.setDate(inicio.getDate() - primeiro.getDay());
    return {
      primeiroDia: inicio,
      semanas: Math.ceil((primeiro.getDay() + nDias) / 7),
      diasNoMes: nDias,
    };
  }, [ano, mes]);

  /** As 7×N datas da grade, em ISO. */
  const celulas = useMemo(() => {
    const saida: string[] = [];
    for (let i = 0; i < semanas * 7; i++) {
      const d = new Date(primeiroDia);
      d.setDate(d.getDate() + i);
      saida.push(paraIso(d));
    }
    return saida;
  }, [primeiroDia, semanas]);

  /** As fases visíveis, com o arrasto já aplicado, empilhadas em faixas. */
  const barras = useMemo(() => {
    const itens: { campanha: Campanha; fase: Fase }[] = [];
    for (const c of campanhas) {
      for (const f of c.phases) {
        if (!f.start) continue;
        // Aplica o deslocamento ao vivo: a barra acompanha o cursor.
        const emMovimento = arrasto?.faseId === f.id;
        if (!emMovimento) {
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
          // Redimensionar nunca inverte: o início não passa do fim.
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

  /** Quantas faixas cada semana usa — define a altura da linha. */
  const faixasPorSemana = useMemo(() => {
    const contagem = new Array(semanas).fill(1);
    for (const b of barras) {
      for (let s = 0; s < semanas; s++) {
        const ini = celulas[s * 7]!;
        const fim = celulas[s * 7 + 6]!;
        if (b.start <= fim && b.fim >= ini) contagem[s] = Math.max(contagem[s], b.faixa + 1);
      }
    }
    return contagem;
  }, [barras, celulas, semanas]);

  /**
   * Congela a altura durante o arrasto.
   *
   * Sem isto, mover uma barra para uma semana mais cheia aumenta a linha no
   * meio do gesto e o cursor perde a barra de vista.
   */
  const alturaCongelada = useRef<number[] | null>(null);
  const alturas = arrasto ? (alturaCongelada.current ?? faixasPorSemana) : faixasPorSemana;

  /** Índice da célula sob o ponteiro, ou o mais próximo se soltar fora. */
  function celulaSob(clientX: number, clientY: number): number {
    const grade = gradeRef.current;
    if (!grade) return -1;
    const r = grade.getBoundingClientRect();
    const larguraCol = r.width / 7;
    const col = Math.max(0, Math.min(6, Math.floor((clientX - r.left) / larguraCol)));

    // A altura das linhas varia, então a linha sai de acumular, não de dividir.
    let y = r.top;
    for (let s = 0; s < semanas; s++) {
      const h = ALTURA_CABECALHO + Math.max(alturas[s]!, 1) * ALTURA_BARRA + 8;
      if (clientY < y + h || s === semanas - 1) return s * 7 + col;
      y += h;
    }
    return col;
  }

  function iniciarArrasto(
    e: React.PointerEvent,
    campanha: Campanha,
    fase: Fase,
    modo: Arrasto["modo"],
  ) {
    e.preventDefault();
    e.stopPropagation();
    alturaCongelada.current = faixasPorSemana;
    setArrasto({
      campanhaId: campanha.id,
      faseId: fase.id,
      modo,
      celulaInicial: celulaSob(e.clientX, e.clientY),
      startOriginal: fase.start,
      endOriginal: fase.end,
    });
    setDelta(0);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function moverArrasto(e: React.PointerEvent) {
    if (!arrasto) return;
    const atual = celulaSob(e.clientX, e.clientY);
    if (atual >= 0) setDelta(atual - arrasto.celulaInicial);
  }

  function soltarArrasto() {
    if (!arrasto) return;
    const barra = barras.find((b) => b.fase.id === arrasto.faseId);
    // Delta zero é clique, não arrasto: seleciona em vez de gravar.
    if (delta === 0) onSelecionarFase(arrasto.campanhaId, arrasto.faseId);
    else if (barra) onMudarFase(arrasto.campanhaId, barra.fase);
    setArrasto(null);
    setDelta(0);
    alturaCongelada.current = null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30">
        {DIAS_DA_SEMANA.map((d) => (
          <div key={d} className="py-1.5 text-center text-[10px] uppercase text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      <div
        ref={gradeRef}
        onPointerMove={moverArrasto}
        onPointerUp={soltarArrasto}
        onPointerCancel={soltarArrasto}
        className="relative select-none"
        style={{ touchAction: arrasto ? "none" : undefined }}
      >
        {Array.from({ length: semanas }, (_, s) => {
          const altura = ALTURA_CABECALHO + Math.max(alturas[s]!, 1) * ALTURA_BARRA + 8;
          return (
            <div
              key={s}
              className="relative grid grid-cols-7 border-b border-border/30 last:border-0"
              style={{ height: altura }}
            >
              {Array.from({ length: 7 }, (_, c) => {
                const iso = celulas[s * 7 + c]!;
                const doMes = Number(iso.slice(5, 7)) === mes;
                const fimDeSemana = c === 0 || c === 6;
                const ehHoje = iso === hoje;
                const dia = Number(iso.slice(8, 10));
                return (
                  <div
                    key={c}
                    className={`border-r border-border/20 last:border-0 ${
                      fimDeSemana ? "bg-muted/25" : ""
                    } ${doMes ? "" : "opacity-40"}`}
                  >
                    <div className="flex items-center gap-1 px-1 pt-1">
                      <span
                        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                          ehHoje ? "bg-[#1a73e8] font-semibold text-white" : "text-muted-foreground"
                        }`}
                      >
                        {dia}
                      </span>
                      {/* O dia 1 mostra o mês: numa grade que começa no domingo
                          anterior, sem isso não dá para saber onde o mês vira. */}
                      {dia === 1 && (
                        <span className="text-[9px] uppercase text-muted-foreground">
                          {MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

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
                const selecionada = faseSelecionada === b.fase.id;
                const arrastando = arrasto?.faseId === b.fase.id;

                return (
                  <div
                    key={`${b.fase.id}-${s}`}
                    onPointerDown={(e) => iniciarArrasto(e, b.campanha, b.fase, "mover")}
                    title={`${b.fase.name} · ${b.campanha.name}\n${br(b.start)} → ${
                      b.fase.end ? br(b.fim) : "em aberto"
                    }`}
                    className={`absolute flex cursor-grab items-center gap-1 overflow-hidden px-1 text-[10px] leading-none ${
                      arrastando ? "z-20 cursor-grabbing opacity-90 shadow-lg" : "z-10"
                    } ${selecionada ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                    style={{
                      left: `calc(${(col / 7) * 100}% + 2px)`,
                      width: `calc(${(span / 7) * 100}% - 4px)`,
                      top: ALTURA_CABECALHO + b.faixa * ALTURA_BARRA,
                      height: ALTURA_BARRA - 3,
                      backgroundColor: b.campanha.color,
                      color: corDoTexto(b.campanha.color),
                      // Só as pontas externas arredondam: a fase parece uma coisa
                      // só que continua na linha de baixo.
                      borderRadius: `${primeiro ? "4px" : "0"} ${ultimo ? "4px" : "0"} ${
                        ultimo ? "4px" : "0"
                      } ${primeiro ? "4px" : "0"}`,
                      // Fim em aberto: a borda direita fica tracejada, dizendo
                      // que a fase não termina ali — ela só não tem fim ainda.
                      borderRight: aberta && ultimo ? "2px dashed rgba(255,255,255,.6)" : undefined,
                    }}
                  >
                    {primeiro && (
                      <>
                        <span
                          onPointerDown={(e) => iniciarArrasto(e, b.campanha, b.fase, "inicio")}
                          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize"
                          aria-hidden
                        />
                        <span className="shrink-0 opacity-70 tabular-nums">
                          {b.start.slice(8, 10)}/{b.start.slice(5, 7)}
                        </span>
                      </>
                    )}
                    <span className="truncate font-medium">{b.fase.name}</span>
                    <span className="truncate opacity-70">· {b.campanha.name}</span>
                    {ultimo && !aberta && (
                      <span
                        onPointerDown={(e) => iniciarArrasto(e, b.campanha, b.fase, "fim")}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize"
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {diasNoMes === 0 && <p className="p-4 text-sm text-muted-foreground">Mês inválido.</p>}
    </div>
  );
}
