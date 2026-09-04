"use client";

/**
 * Comentários sobre o mapa — os alfinetes e a conversa de cada um.
 *
 * ## O modo comentário
 *
 * Enquanto ligado, clicar no quadro cria um alfinete ali. É modo, e não um
 * gesto solto, porque o clique no fundo já significa outra coisa (limpar a
 * seleção) e sobrecarregá-lo faria comentar por acidente a cada clique.
 *
 * ## Resolver, não apagar
 *
 * A conversa resolvida some do quadro mas continua no banco: "por que a gente
 * mudou isso?" é a pergunta que aparece três meses depois, e apagar o
 * histórico é justamente o que impede respondê-la. O contador na barra deixa
 * reabrir o que foi resolvido.
 */

import { useState } from "react";
import { Check, MessageCircle, MessageSquarePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  emConversas,
  useApagarComentario,
  useAtualizarComentario,
  useComentar,
  useComentariosDoMapa,
  type ConversaDoMapa,
} from "@/lib/hooks/use-mapa-comentarios";

/** "há 3 dias" diz mais que a data para conversa recente. */
function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function Iniciais({ nome }: { nome: string | null }) {
  const partes = (nome ?? "?").trim().split(/\s+/).filter(Boolean);
  const txt =
    partes.length === 0
      ? "?"
      : partes.length === 1
        ? partes[0]!.slice(0, 2).toUpperCase()
        : (partes[0]![0]! + partes.at(-1)![0]!).toUpperCase();
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/20 text-[8px] font-semibold">
      {txt}
    </span>
  );
}

export function ConversaAberta({
  conversa,
  mapId,
  onFechar,
}: {
  conversa: ConversaDoMapa;
  mapId: string;
  onFechar: () => void;
}) {
  const responder = useComentar(mapId);
  const atualizar = useAtualizarComentario(mapId);
  const apagar = useApagarComentario(mapId);
  const [texto, setTexto] = useState("");

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo) return;
    try {
      await responder.mutateAsync({
        tabId: conversa.tabId,
        texto: limpo,
        parentId: conversa.id,
      });
      setTexto("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui responder");
    }
  }

  return (
    <div className="w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <MessageCircle className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 text-[11px] font-medium">
          {conversa.respostas.length + 1}{" "}
          {conversa.respostas.length === 0 ? "comentário" : "mensagens"}
        </span>
        <button
          type="button"
          onClick={() => {
            atualizar.mutate(
              { id: conversa.id, resolvido: true },
              { onSuccess: () => { toast.success("Conversa resolvida"); onFechar(); } },
            );
          }}
          title="Resolver"
          aria-label="Resolver conversa"
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-emerald-500"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            // Apagar leva as respostas junto (CASCADE) — por isso a confirmação
            // fala em "conversa", não em "comentário".
            apagar.mutate(conversa.id, {
              onSuccess: () => { toast.success("Conversa apagada"); onFechar(); },
            });
          }}
          title="Apagar a conversa"
          aria-label="Apagar a conversa"
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-56 space-y-2.5 overflow-y-auto p-2.5">
        {[conversa, ...conversa.respostas].map((c) => (
          <div key={c.id} className="flex gap-1.5">
            <Iniciais nome={c.autor} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5">
                <span className="truncate text-[11px] font-medium">{c.autor ?? "Alguém"}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {quando(c.createdAt)}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-[11.5px] leading-snug">
                {c.texto}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-1.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha: numa caixa de resposta a
            // mensagem curta é a regra, e pedir um clique para cada uma seria
            // um passo a mais em todas.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Responder…  (Enter envia)"
          rows={2}
          className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[11.5px] outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

/**
 * O alfinete no quadro.
 *
 * Fica em coordenada de tela, não de desenho: um alfinete que encolhe com o
 * zoom vira um ponto ilegível num mapa afastado, e é justamente afastado que
 * se procura o que ainda está em aberto.
 */
export function Alfinete({
  numero,
  ativo,
  onClick,
}: {
  numero: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`grid h-6 w-6 place-items-center rounded-full rounded-bl-none text-[10px] font-bold shadow-md transition-transform hover:scale-110 ${
        ativo ? "bg-primary text-primary-foreground" : "bg-amber-400 text-amber-950"
      }`}
      aria-label={`Comentário ${numero}`}
    >
      {numero}
    </button>
  );
}

/** O botão que liga o modo, com o contador de conversas abertas. */
export function BotaoDeComentarios({
  mapId,
  ativo,
  onAlternar,
}: {
  mapId: string | null;
  ativo: boolean;
  onAlternar: () => void;
}) {
  const { data } = useComentariosDoMapa(mapId);
  const abertas = emConversas(data?.comentarios ?? []).filter((c) => !c.resolvido).length;

  return (
    <Button
      variant={ativo ? "secondary" : "ghost"}
      size="icon"
      className="relative h-6 w-6"
      onClick={onAlternar}
      disabled={!mapId}
      // Um mapa que ainda não foi salvo não tem id: o comentário nasceria órfão.
      title={mapId ? (ativo ? "Sair do modo comentário" : "Comentar no mapa") : "Salve o mapa para comentar"}
      aria-label="Comentários"
    >
      <MessageSquarePlus className="h-3 w-3" />
      {abertas > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-3 min-w-3 place-items-center rounded-full bg-amber-400 px-0.5 text-[8px] font-bold text-amber-950">
          {abertas}
        </span>
      )}
    </Button>
  );
}
