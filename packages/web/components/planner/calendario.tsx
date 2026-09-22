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
 * ## Empilhadas POR SEMANA, com "+N"
 *
 * As faixas eram numeradas no mês inteiro: numa semana com três fases, as
 * barras caíam nas faixas 0, 4 e 7 por causa de sobreposições de OUTRAS
 * semanas, e a semana ganhava linhas vazias. E sem limite, dez campanhas no
 * mesmo dia viravam uma torre que empurrava o resto do mês para fora da tela
 * — parecia que as barras sumiam (21/09/2026). Agora cada semana empilha só o
 * que tem, até `MAX_LINHAS`; o que não cabe vira "+N" no dia, e o "+N" abre a
 * lista completa daquele dia — como no Google Calendar.
 *
 * ## Clicar abre o popover da fase
 *
 * Nome, datas, "ver no card" e excluir, no lugar do clique. Antes o clique só
 * rolava a lista até o card — longe de onde a pessoa estava olhando.
 *
 * ## Faixas congeladas durante o arrasto
 *
 * A altura da semana depende de quantas faixas ela usa. Recalcular isso durante
 * o gesto faria a linha pular debaixo do cursor e a barra escapar.
 */

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Trash2, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
/** Linhas por semana. Passando disso, a última vira a linha do "+N". */
const MAX_LINHAS = 5;

interface Arrasto {
  campanhaId: string;
  faseId: string;
  modo: "mover" | "inicio" | "fim";
  celulaInicial: number;
  startOriginal: string;
  endOriginal: string;
}

interface Segmento {
  campanha: Campanha;
  fase: Fase;
  start: string;
  fim: string;
  /** O pedaço da fase que cai nesta semana. */
  de: string;
  ate: string;
  linha: number;
}

type Aberto =
  | { tipo: "fase"; campanhaId: string; faseId: string; x: number; y: number }
  | { tipo: "dia"; iso: string; x: number; y: number }
  | null;

export function Calendario({
  campanhas,
  ano,
  mes,
  faseSelecionada,
  onSelecionarFase,
  onMudarFase,
  onExcluirFase,
  onAbrirCard,
}: {
  campanhas: Campanha[];
  ano: number;
  mes: number;
  faseSelecionada: string | null;
  onSelecionarFase: (campanhaId: string, faseId: string) => void;
  onMudarFase: (campanhaId: string, fase: Fase) => void;
  onExcluirFase?: (campanhaId: string, faseId: string) => void;
  /** Leva ao card da campanha — só existe onde há cards ao lado. */
  onAbrirCard?: (campanhaId: string) => void;
}) {
  const gradeRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [delta, setDelta] = useState(0);
  const [aberto, setAberto] = useState<Aberto>(null);
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

  /** As fases visíveis, já com o arrasto aplicado. */
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
    // `emFaixas` normaliza início/fim e ordena; a faixa dele (do mês todo) não
    // é usada — cada semana empilha a sua, abaixo.
    return emFaixas(itens);
  }, [campanhas, arrasto, delta]);

  /** Cada semana: seus segmentos empilhados, quantas linhas mostra e o "+N" por dia. */
  const porSemana = useMemo(
    () =>
      Array.from({ length: semanas }, (_, s) => {
        const ini = celulas[s * 7]!;
        const fimSemana = celulas[s * 7 + 6]!;
        const segs: Segmento[] = barras
          .filter((b) => !(b.start > fimSemana || b.fim < ini))
          .map((b) => ({
            campanha: b.campanha,
            fase: b.fase,
            start: b.start,
            fim: b.fim,
            de: b.start > ini ? b.start : ini,
            ate: b.fim < fimSemana ? b.fim : fimSemana,
            linha: 0,
          }))
          // Quem começou antes fica em cima: a fase que vem da semana anterior
          // continua no topo, como no Google.
          .sort(
            (a, b) =>
              a.start.localeCompare(b.start) ||
              dias(b.start, b.fim) - dias(a.start, a.fim) ||
              a.campanha.name.localeCompare(b.campanha.name),
          );
        const linhas: [string, string][][] = [];
        for (const g of segs) {
          let n = 0;
          while (linhas[n]?.some(([x, y]) => !(g.ate < x || g.de > y))) n++;
          (linhas[n] ??= []).push([g.de, g.ate]);
          g.linha = n;
        }
        const total = linhas.length;
        const mostradas = total > MAX_LINHAS ? MAX_LINHAS - 1 : total;
        const escondidasNoDia = Array.from({ length: 7 }, (_, c) => {
          const iso = celulas[s * 7 + c]!;
          return segs.filter((g) => g.linha >= mostradas && g.de <= iso && g.ate >= iso).length;
        });
        return { segs, total, mostradas, escondidasNoDia };
      }),
    [barras, celulas, semanas],
  );

  const linhasPorSemana = porSemana.map((w) => Math.max(1, Math.min(w.total, MAX_LINHAS)));
  const congelado = useRef<number[] | null>(null);
  const alturas = arrasto ? (congelado.current ?? linhasPorSemana) : linhasPorSemana;

  const alturaDaSemana = (s: number) => ALTURA_DO_DIA + alturas[s]! * PASSO_FAIXA + 6;

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

  /** Posição do clique dentro da grade — onde o popover se ancora. */
  function pontoNaGrade(clientX: number, clientY: number) {
    const r = gradeRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  }

  function iniciar(e: React.PointerEvent, c: Campanha, f: Fase, modo: Arrasto["modo"]) {
    e.preventDefault();
    e.stopPropagation();
    congelado.current = linhasPorSemana;
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

  function soltar(e: React.PointerEvent) {
    if (!arrasto) return;
    const barra = barras.find((b) => b.fase.id === arrasto.faseId);
    // Delta zero é clique, não arrasto: abre o popover em vez de gravar.
    if (delta === 0) {
      onSelecionarFase(arrasto.campanhaId, arrasto.faseId);
      setAberto({ tipo: "fase", campanhaId: arrasto.campanhaId, faseId: arrasto.faseId, ...pontoNaGrade(e.clientX, e.clientY) });
    } else if (barra) onMudarFase(arrasto.campanhaId, barra.fase);
    setArrasto(null);
    setDelta(0);
    congelado.current = null;
  }

  // O popover lê a fase dos dados ATUAIS: editar a data move a barra, e a
  // atualização automática da tela pode trazer mudança de outra pessoa.
  const faseAberta =
    aberto?.tipo === "fase"
      ? (() => {
          const c = campanhas.find((x) => x.id === aberto.campanhaId);
          const f = c?.phases.find((x) => x.id === aberto.faseId);
          return c && f ? { campanha: c, fase: f } : null;
        })()
      : null;
  const doDia =
    aberto?.tipo === "dia"
      ? barras.filter((b) => b.start <= aberto.iso && b.fim >= aberto.iso)
      : [];

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
          className="relative select-none"
          style={{ touchAction: arrasto ? "none" : undefined }}
        >
          {porSemana.map((semana, s) => (
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

              {semana.segs
                .filter((g) => g.linha < semana.mostradas)
                .map((g) => {
                  const iniSemana = celulas[s * 7]!;
                  const fimSemana = celulas[s * 7 + 6]!;
                  const col = dias(iniSemana, g.de);
                  const span = dias(g.de, g.ate) + 1;
                  const primeiro = g.start >= iniSemana;
                  const ultimo = g.fim <= fimSemana;
                  const aberta = !g.fase.end;
                  const arrastando = arrasto?.faseId === g.fase.id;

                  return (
                    <div
                      key={`${g.fase.id}-${s}`}
                      onPointerDown={(e) => iniciar(e, g.campanha, g.fase, "mover")}
                      title={`${g.fase.name} · ${g.campanha.name}\n${br(g.start)} → ${
                        g.fase.end ? br(g.fim) : "em aberto"
                      }`}
                      className={`absolute flex cursor-pointer select-none items-center gap-[5px] overflow-hidden whitespace-nowrap px-1.5 text-[11.5px] font-medium leading-[18px] transition-[filter] hover:brightness-110 active:cursor-grabbing ${
                        arrastando ? "z-40 cursor-grabbing brightness-110 shadow-lg" : "z-10"
                      } ${faseSelecionada === g.fase.id ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                      style={{
                        left: `calc(${(col / 7) * 100}% + 2px)`,
                        width: `calc(${(span / 7) * 100}% - 4px)`,
                        top: ALTURA_DO_DIA + g.linha * PASSO_FAIXA,
                        height: ALTURA_BARRA,
                        backgroundColor: g.campanha.color,
                        color: corDoTexto(g.campanha.color),
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
                            onPointerDown={(e) => iniciar(e, g.campanha, g.fase, "inicio")}
                            className="absolute bottom-0 left-0 top-0 z-[2] w-[7px] cursor-ew-resize"
                            aria-hidden
                          />
                          <span className="hidden flex-none text-[10.5px] font-normal opacity-80 sm:inline">
                            {g.start.slice(8, 10)}/{g.start.slice(5, 7)}
                          </span>
                        </>
                      )}
                      <span className="overflow-hidden text-ellipsis">{g.fase.name}</span>
                      <span className="hidden overflow-hidden text-ellipsis font-normal opacity-[0.72] md:inline">
                        · {g.campanha.name}
                      </span>
                      {ultimo && !aberta && (
                        <span
                          onPointerDown={(e) => iniciar(e, g.campanha, g.fase, "fim")}
                          className="absolute bottom-0 right-0 top-0 z-[2] w-[7px] cursor-ew-resize"
                          aria-hidden
                        />
                      )}
                    </div>
                  );
                })}

              {/* "+N": o que não coube no dia. Abre a lista completa dele. */}
              {semana.escondidasNoDia.map((n, c) =>
                n > 0 ? (
                  <button
                    key={`mais-${c}`}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      setAberto({ tipo: "dia", iso: celulas[s * 7 + c]!, ...pontoNaGrade(e.clientX, e.clientY) })
                    }
                    className="absolute z-20 rounded px-1.5 text-left text-[11px] font-medium leading-[18px] text-foreground/80 hover:bg-foreground/10"
                    style={{
                      left: `calc(${(c / 7) * 100}% + 2px)`,
                      width: `calc(${100 / 7}% - 4px)`,
                      top: ALTURA_DO_DIA + semana.mostradas * PASSO_FAIXA,
                      height: ALTURA_BARRA,
                    }}
                  >
                    +{n}
                  </button>
                ) : null,
              )}
            </div>
          ))}

          <Popover open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
            <PopoverAnchor asChild>
              <span
                className="pointer-events-none absolute h-0 w-0"
                style={{ left: aberto?.x ?? 0, top: aberto?.y ?? 0 }}
              />
            </PopoverAnchor>
            <PopoverContent
              className="w-[300px] p-0"
              align="start"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {faseAberta ? (
                <PopoverDaFase
                  campanha={faseAberta.campanha}
                  fase={faseAberta.fase}
                  onMudar={(f) => onMudarFase(faseAberta.campanha.id, f)}
                  onExcluir={
                    onExcluirFase
                      ? () => {
                          onExcluirFase(faseAberta.campanha.id, faseAberta.fase.id);
                          setAberto(null);
                        }
                      : undefined
                  }
                  onAbrirCard={
                    onAbrirCard
                      ? () => {
                          onAbrirCard(faseAberta.campanha.id);
                          setAberto(null);
                        }
                      : undefined
                  }
                  onFechar={() => setAberto(null)}
                />
              ) : aberto?.tipo === "dia" ? (
                <div className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] font-semibold">{br(aberto.iso)}</p>
                    <button
                      type="button"
                      onClick={() => setAberto(null)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10"
                      aria-label="Fechar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ul className="max-h-[320px] space-y-1 overflow-y-auto">
                    {doDia.map((b) => (
                      <li key={b.fase.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setAberto({ tipo: "fase", campanhaId: b.campanha.id, faseId: b.fase.id, x: aberto.x, y: aberto.y })
                          }
                          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-foreground/5"
                        >
                          <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: b.campanha.color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium">{b.fase.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {b.campanha.name} · {br(b.start)} → {b.fase.end ? br(b.fim) : "em aberto"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

/** O popover da fase: o que o Google Calendar mostra ao clicar num evento. */
function PopoverDaFase({
  campanha,
  fase,
  onMudar,
  onExcluir,
  onAbrirCard,
  onFechar,
}: {
  campanha: Campanha;
  fase: Fase;
  onMudar: (f: Fase) => void;
  onExcluir?: () => void;
  onAbrirCard?: () => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(fase.name);
  const duracao = fase.start ? dias(fase.start, fase.end || fase.start) + 1 : 0;
  const salvarNome = () => {
    const n = nome.trim();
    if (n && n !== fase.name) onMudar({ ...fase, name: n });
    else setNome(fase.name);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: campanha.color }} />
        <div className="min-w-0 flex-1">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setNome(fase.name);
            }}
            aria-label="Nome da fase"
            className="w-full rounded border border-transparent bg-transparent px-1 text-[14px] font-semibold hover:border-border focus:border-border focus:outline-none"
          />
          <p className="truncate px-1 text-[12px] text-muted-foreground">{campanha.name}</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-[11px] text-muted-foreground">
          Início
          <input
            type="date"
            value={fase.start}
            onChange={(e) => e.target.value && onMudar({ ...fase, start: e.target.value })}
            className="block w-full rounded border border-border bg-background px-1.5 py-1 text-[12px] text-foreground"
          />
        </label>
        <label className="space-y-0.5 text-[11px] text-muted-foreground">
          Fim
          <input
            type="date"
            value={fase.end}
            min={fase.start || undefined}
            onChange={(e) => onMudar({ ...fase, end: e.target.value })}
            className="block w-full rounded border border-border bg-background px-1.5 py-1 text-[12px] text-foreground"
          />
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {fase.end ? `${duracao} ${duracao === 1 ? "dia" : "dias"}` : "Sem data de fim (em aberto)"}
        {campanha.googleCalendarId &&
          (fase.googleEventId ? " · na agenda do Google" : " · ainda não enviada ao Google")}
      </p>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        {onAbrirCard ? (
          <button
            type="button"
            onClick={onAbrirCard}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] hover:bg-foreground/5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver no card
          </button>
        ) : (
          <span />
        )}
        {onExcluir && (
          <button
            type="button"
            onClick={onExcluir}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir fase
          </button>
        )}
      </div>
    </div>
  );
}
