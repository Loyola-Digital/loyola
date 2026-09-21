"use client";

/**
 * Os cards — onde se digita.
 *
 * A estrutura é a do planner original, medida no CSS dele: grade de
 * `1fr 120px 120px 42px 22px`, cabeçalho de 26px, linha de 34px, datas em fonte
 * mono centralizada sobre fundo afundado. O que muda são os tokens: onde ele
 * usa `--surface` e `--line` fixos, aqui entram `bg-card` e `border-border` do
 * nosso design system, que já respondem ao tema.
 *
 * ## Quando salva
 *
 * Texto salva ao SAIR do campo, não a cada tecla. O original mandava por
 * caractere porque o Firestore aguentava; aqui seria uma requisição por letra.
 */

import { useEffect, useState } from "react";
import { CalendarDays, GripVertical, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { br, dias, novoId, periodo, type Campanha, type Fase } from "@/lib/planner/datas";

/**
 * Campo de texto que só avisa quando a pessoa termina.
 *
 * Guarda o próprio rascunho enquanto está em foco — sem isso, uma atualização
 * vinda do servidor no meio da digitação apagaria o que está sendo escrito.
 */
function TextoInline({
  valor,
  onSalvar,
  className,
  placeholder,
  style,
}: {
  valor: string;
  onSalvar: (v: string) => void;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [rascunho, setRascunho] = useState(valor);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setRascunho(valor);
  }, [valor, editando]);

  return (
    <input
      value={rascunho}
      placeholder={placeholder}
      style={style}
      onFocus={() => setEditando(true)}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (rascunho !== valor) onSalvar(rascunho);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setRascunho(valor);
          setEditando(false);
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

/** A grade das linhas de fase. Idêntica ao `.phead`/`.prow` do original. */
const GRADE = "grid grid-cols-[minmax(0,1fr)_120px_120px_42px_22px] items-center gap-1.5 px-3";

function LinhaDaFase({
  fase,
  cor,
  selecionada,
  onMudar,
  onExcluir,
  onSelecionar,
}: {
  fase: Fase;
  cor: string;
  selecionada: boolean;
  onMudar: (f: Fase) => void;
  onExcluir: () => void;
  onSelecionar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fase.id,
  });
  const vazia = !fase.start;
  // "aberto" quando só tem início; "—" quando não tem data. Os dois são
  // estados de verdade no planejamento, e "0 dias" apagaria a diferença.
  const duracao = vazia ? "—" : fase.end ? String(dias(fase.start, fase.end)) : "aberto";

  return (
    <div
      ref={setNodeRef}
      onClick={onSelecionar}
      className={`${GRADE} h-[34px] border-b border-border/60 bg-card transition-colors last:border-b-0 ${
        selecionada ? "" : "hover:bg-muted/40"
      } ${isDragging ? "relative z-20 shadow-md" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(selecionada
          ? { backgroundColor: `color-mix(in srgb, ${cor} 9%, transparent)` }
          : {}),
      }}
    >
      <span className="flex min-w-0 items-center gap-1">
        {/* A alça vem antes do nome: arrastar pelo corpo da linha brigaria com
            o clique nos campos, e quem tentasse selecionar um texto sairia
            reordenando a fase. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Reordenar ${fase.name}`}
          title="Arraste para reordenar"
          className="grid h-5 w-3 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </button>

        {/* A barrinha é a BORDA do input, como no original — assim ela acompanha
            a altura do campo em vez de flutuar ao lado. */}
        <TextoInline
        valor={fase.name}
        onSalvar={(name) => onMudar({ ...fase, name })}
        placeholder="Nova fase"
        style={{
          borderLeft: `3px solid ${vazia ? `color-mix(in srgb, ${cor} 35%, transparent)` : cor}`,
        }}
          className={`w-full rounded-[5px] bg-transparent px-1.5 py-0.5 text-[13px] outline-none hover:bg-foreground/5 ${
            vazia ? "text-muted-foreground" : ""
          }`}
        />
      </span>

      <input
        type="date"
        value={fase.start}
        onChange={(e) => onMudar({ ...fase, start: e.target.value })}
        className="w-full rounded-[5px] border border-transparent bg-muted px-1.5 py-0.5 text-center font-mono text-[11.5px] tabular-nums text-foreground/80 outline-none hover:border-border focus:border-foreground focus:bg-card focus:text-foreground"
      />

      <input
        type="date"
        value={fase.end}
        // Sem início não há fim: bloquear é melhor que aceitar um valor que o
        // servidor vai zerar em seguida.
        disabled={vazia}
        min={fase.start || undefined}
        onChange={(e) => onMudar({ ...fase, end: e.target.value })}
        className="w-full rounded-[5px] border border-transparent bg-muted px-1.5 py-0.5 text-center font-mono text-[11.5px] tabular-nums text-foreground/80 outline-none hover:border-border focus:border-foreground focus:bg-card focus:text-foreground disabled:opacity-40"
      />

      <span
        className={`text-right font-mono tabular-nums ${
          duracao === "aberto"
            ? "text-[10px] tracking-wide text-muted-foreground"
            : "text-[11.5px] text-foreground/80"
        }`}
      >
        {duracao}
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExcluir();
        }}
        aria-label={`Excluir fase ${fase.name}`}
        title="Excluir fase"
        className="grid h-[22px] w-[22px] place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function CardDeCampanha({
  campanha,
  faseSelecionada,
  onMudar,
  onExcluir,
  onDuplicar,
  onSelecionarFase,
  onExcluirFase,
  agendas,
  arrastavel = true,
}: {
  campanha: Campanha;
  faseSelecionada: string | null;
  onMudar: (dados: {
    name?: string;
    color?: string;
    phases?: Fase[];
    googleCalendarId?: string | null;
  }) => void;
  onExcluir: () => void;
  onDuplicar: () => void;
  onSelecionarFase: (faseId: string) => void;
  /** Agendas conectadas, para escolher qual espelha esta campanha. */
  agendas?: { calendarId: string; label: string }[];
  /**
   * Excluir fase passa pela página, e não por `onMudar`, porque de lá sai o
   * aviso com o botão de desfazer — que precisa da fase original em mãos.
   */
  onExcluirFase: (faseId: string) => void;
  /** Fora de uma lista ordenável, a alça não teria o que fazer. */
  arrastavel?: boolean;
}) {
  const p = periodo(campanha.phases);
  const total = p ? dias(p.inicio, p.fim) : null;
  const cor = campanha.color;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: campanha.id,
    disabled: !arrastavel,
  });

  // 4px antes de considerar arrasto: sem isso, um clique na alça com o dedo
  // trêmulo já reordenaria a lista.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function soltarFase(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = campanha.phases.findIndex((f) => f.id === active.id);
    const para = campanha.phases.findIndex((f) => f.id === over.id);
    if (de < 0 || para < 0) return;
    const novas = [...campanha.phases];
    const [movida] = novas.splice(de, 1);
    novas.splice(para, 0, movida!);
    onMudar({ phases: novas });
  }

  return (
    <article
      ref={setNodeRef}
      id={`campanha-${campanha.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Levantado enquanto arrasta: sem isso ele passa POR BAIXO dos vizinhos
        // e some justo no gesto em que se está olhando para ele.
        zIndex: isDragging ? 30 : undefined,
      }}
      className={`overflow-hidden rounded-[10px] border bg-card shadow-sm ${
        isDragging ? "border-primary/60 opacity-90 shadow-lg" : "border-border"
      }`}
    >
      <header
        className="flex items-start gap-2.5 border-b border-border px-3.5 pb-3 pt-3.5"
        style={{ backgroundColor: `color-mix(in srgb, ${cor} 9%, transparent)` }}
      >
        {/* A alça: um alvo explícito, e não o card inteiro.
            Arrastar pelo corpo brigaria com o clique nos campos de texto e nas
            datas — a pessoa tentaria selecionar um nome e sairia arrastando o
            card. O ícone diz onde pegar. */}
        {arrastavel && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reordenar ${campanha.name}`}
            title="Arraste para reordenar"
            className="-ml-1 grid h-6 w-4 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Faixa de 4px esticada na altura do cabeçalho. */}
        <span
          className="min-h-[30px] w-1 shrink-0 self-stretch rounded-sm"
          style={{ backgroundColor: cor }}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <TextoInline
            valor={campanha.name}
            onSalvar={(name) => onMudar({ name })}
            placeholder="Nome da campanha"
            className="w-full rounded bg-transparent text-[14px] font-semibold tracking-[-0.01em] outline-none hover:bg-foreground/5"
          />
          <p className="mt-0.5 flex flex-wrap gap-2 font-mono text-[10.5px] text-muted-foreground">
            <span>
              {campanha.phases.length} {campanha.phases.length === 1 ? "fase" : "fases"}
            </span>
            {p && (
              <>
                <span>
                  {br(p.inicio)} → {br(p.fim)}
                </span>
                <span>{total}d</span>
              </>
            )}
            {/*
              O espelho na agenda do Google.

              Fica aqui, junto do resto que descreve a campanha, e não escondido
              num menu: o que este campo decide é se o cronograma aparece para o
              time inteiro no Google ou só nesta tela — e quem está montando a
              campanha precisa ver isso sem procurar.
            */}
            {agendas && agendas.length > 0 && (
              <span className="relative inline-flex items-center gap-1">
                <CalendarDays
                  className={`h-3 w-3 ${campanha.googleCalendarId ? "text-primary" : "opacity-50"}`}
                />
                <select
                  value={campanha.googleCalendarId ?? ""}
                  onChange={(e) => onMudar({ googleCalendarId: e.target.value || null })}
                  aria-label={`Agenda do Google de ${campanha.name}`}
                  title={
                    campanha.googleCalendarId
                      ? "As mudanças aqui vão para esta agenda"
                      : "Esta campanha não vai para o Google"
                  }
                  className="max-w-[130px] cursor-pointer truncate border-0 bg-transparent p-0 font-mono text-[10.5px] text-muted-foreground outline-none hover:text-foreground focus:text-foreground"
                >
                  <option value="">sem agenda</option>
                  {agendas.map((a) => (
                    <option key={a.calendarId} value={a.calendarId}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </span>
            )}
          </p>
        </div>

        {/* A cor é a do expert, fixa (`cor-do-expert.ts`): não há mais o que
            escolher aqui, só a legenda de quem é a campanha. */}
        <span
          className="grid h-6 w-6 shrink-0 place-items-center"
          title="Cor do expert: PP verde · FZ rosa · DG azul · BBE vinho · Lyrio cinza · Geral amarelo"
        >
          <span
            className="h-3.5 w-3.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.15)]"
            style={{ backgroundColor: cor }}
          />
        </span>

        <button
          type="button"
          onClick={onExcluir}
          aria-label={`Excluir campanha ${campanha.name}`}
          title="Excluir campanha"
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div
        className={`${GRADE} h-[26px] border-b border-border bg-muted/40 font-mono text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground`}
      >
        <span>Fase</span>
        <span className="text-center">Início</span>
        <span className="text-center">Fim</span>
        <span className="text-right">Dias</span>
        <span />
      </div>

      {/* Contexto PRÓPRIO das fases: aninhado no das campanhas, mas separado —
          arrastar uma fase não pode mover o card que a contém. */}
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltarFase}>
        <SortableContext
          items={campanha.phases.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          {campanha.phases.map((f) => (
            <LinhaDaFase
              key={f.id}
              fase={f}
              cor={cor}
              selecionada={faseSelecionada === f.id}
              onMudar={(atualizada) =>
                onMudar({
                  phases: campanha.phases.map((x) => (x.id === atualizada.id ? atualizada : x)),
                })
              }
              onExcluir={() => onExcluirFase(f.id)}
              onSelecionar={() => onSelecionarFase(f.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <footer className="flex gap-1.5 border-t border-border bg-muted/40 px-3 py-1.5">
        <button
          type="button"
          onClick={() =>
            onMudar({
              phases: [...campanha.phases, { id: novoId(), name: "Nova fase", start: "", end: "" }],
            })
          }
          className="rounded-[5px] px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          + Adicionar fase
        </button>
        <button
          type="button"
          onClick={onDuplicar}
          className="rounded-[5px] px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          Duplicar campanha
        </button>
      </footer>
    </article>
  );
}
