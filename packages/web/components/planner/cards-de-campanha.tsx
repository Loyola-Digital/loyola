"use client";

/**
 * Os cards — onde se digita.
 *
 * O calendário e a timeline servem para VER e para arrastar; aqui é onde se
 * escreve nome, escolhe cor e cadastra data com precisão. Por isso todo campo é
 * um input direto, sem modal: abrir uma janela para trocar uma data seria três
 * cliques onde cabe um.
 *
 * ## Quando salva
 *
 * Texto salva ao SAIR do campo, não a cada tecla. O planner original mandava a
 * cada caractere porque o Firestore aguentava; aqui isso viraria uma requisição
 * por letra digitada. Data salva no `change` — o seletor nativo só dispara
 * quando a data está completa, então não há meio-termo a proteger.
 */

import { useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  br,
  corDoTexto,
  dias,
  novoId,
  periodo,
  type Campanha,
  type Fase,
} from "@/lib/planner/datas";

/**
 * Um campo de texto que só avisa quando a pessoa termina.
 *
 * Mantém o próprio estado enquanto está sendo editado — sem isso, uma
 * atualização vinda do servidor no meio da digitação apagaria o que está sendo
 * escrito.
 */
function TextoQueSalvaAoSair({
  valor,
  onSalvar,
  className,
  placeholder,
}: {
  valor: string;
  onSalvar: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [rascunho, setRascunho] = useState(valor);
  const [editando, setEditando] = useState(false);

  // Só aceita o valor de fora quando NÃO está editando.
  useEffect(() => {
    if (!editando) setRascunho(valor);
  }, [valor, editando]);

  return (
    <input
      value={rascunho}
      placeholder={placeholder}
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

function LinhaDaFase({
  fase,
  selecionada,
  onMudar,
  onExcluir,
  onSelecionar,
}: {
  fase: Fase;
  selecionada: boolean;
  onMudar: (f: Fase) => void;
  onExcluir: () => void;
  onSelecionar: () => void;
}) {
  // "aberto" quando só tem início: a fase começou e ninguém sabe quando acaba.
  // "—" quando não tem data nenhuma. Os dois são estados de verdade no
  // planejamento, e mostrar "0 dias" nos dois casos apagaria a diferença.
  const duracao = !fase.start ? "—" : fase.end ? String(dias(fase.start, fase.end)) : "aberto";

  return (
    <tr
      onClick={onSelecionar}
      data-vazia={!fase.start ? "1" : undefined}
      className={`group/linha cursor-pointer border-b border-border/30 last:border-0 transition-colors ${
        selecionada ? "bg-primary/5" : "hover:bg-muted/40"
      } data-[vazia]:opacity-55`}
    >
      <td className="py-1">
        <TextoQueSalvaAoSair
          valor={fase.name}
          onSalvar={(name) => onMudar({ ...fase, name })}
          placeholder="Nome da fase"
          className="w-full bg-transparent px-1 text-xs outline-none focus:rounded focus:bg-background focus:ring-1 focus:ring-primary/40"
        />
      </td>
      <td className="py-1">
        <input
          type="date"
          value={fase.start}
          onChange={(e) => onMudar({ ...fase, start: e.target.value })}
          className="w-[120px] rounded bg-transparent px-1 text-[11px] tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-primary/40"
        />
      </td>
      <td className="py-1">
        <input
          type="date"
          value={fase.end}
          // Sem início não há fim: o campo fica bloqueado em vez de aceitar um
          // valor que o servidor vai zerar logo em seguida.
          disabled={!fase.start}
          min={fase.start || undefined}
          onChange={(e) => onMudar({ ...fase, end: e.target.value })}
          className="w-[120px] rounded bg-transparent px-1 text-[11px] tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 disabled:opacity-40"
        />
      </td>
      <td className="py-1 pr-1 text-right text-[11px] tabular-nums text-muted-foreground">
        {duracao}
      </td>
      <td className="py-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExcluir();
          }}
          aria-label={`Excluir fase ${fase.name}`}
          className="opacity-0 transition-opacity group-hover/linha:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </td>
    </tr>
  );
}

export function CardDeCampanha({
  campanha,
  faseSelecionada,
  onMudar,
  onExcluir,
  onDuplicar,
  onSelecionarFase,
}: {
  campanha: Campanha;
  faseSelecionada: string | null;
  onMudar: (dados: { name?: string; color?: string; phases?: Fase[] }) => void;
  onExcluir: () => void;
  onDuplicar: () => void;
  onSelecionarFase: (faseId: string) => void;
}) {
  const p = periodo(campanha.phases);
  const total = p ? dias(p.inicio, p.fim) : null;

  function mudarFase(atualizada: Fase) {
    onMudar({ phases: campanha.phases.map((f) => (f.id === atualizada.id ? atualizada : f)) });
  }

  return (
    <article
      id={`campanha-${campanha.id}`}
      className="group overflow-hidden rounded-xl border border-border/50 bg-card"
      style={{ ["--c" as string]: campanha.color }}
    >
      <header
        className="flex items-center gap-2 px-3 py-2"
        style={{
          backgroundColor: `color-mix(in srgb, ${campanha.color} 14%, transparent)`,
          borderLeft: `3px solid ${campanha.color}`,
        }}
      >
        <TextoQueSalvaAoSair
          valor={campanha.name}
          onSalvar={(name) => onMudar({ name })}
          placeholder="Nome da campanha"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none focus:rounded focus:bg-background focus:px-1 focus:ring-1 focus:ring-primary/40"
        />

        <input
          type="color"
          value={campanha.color}
          onChange={(e) => onMudar({ color: e.target.value })}
          aria-label={`Cor de ${campanha.name}`}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <button
          type="button"
          onClick={onExcluir}
          aria-label={`Excluir ${campanha.name}`}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </header>

      <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
        {campanha.phases.length} {campanha.phases.length === 1 ? "fase" : "fases"}
        {p && ` · ${br(p.inicio)} → ${br(p.fim)} · ${total}d`}
      </p>

      <div className="px-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1 pl-1 font-medium">Fase</th>
              <th className="pb-1 font-medium">Início</th>
              <th className="pb-1 font-medium">Fim</th>
              <th className="pb-1 pr-1 text-right font-medium">Dias</th>
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {campanha.phases.map((f) => (
              <LinhaDaFase
                key={f.id}
                fase={f}
                selecionada={faseSelecionada === f.id}
                onMudar={mudarFase}
                onExcluir={() =>
                  onMudar({ phases: campanha.phases.filter((x) => x.id !== f.id) })
                }
                onSelecionar={() => onSelecionarFase(f.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between gap-2 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() =>
            onMudar({
              phases: [...campanha.phases, { id: novoId(), name: "Nova fase", start: "", end: "" }],
            })
          }
        >
          <Plus className="h-3 w-3" />
          Adicionar fase
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={onDuplicar}
        >
          <Copy className="h-3 w-3" />
          Duplicar
        </Button>
      </footer>
    </article>
  );
}

/** O texto sobre a cor da campanha, exposto para o calendário e a timeline. */
export { corDoTexto };
