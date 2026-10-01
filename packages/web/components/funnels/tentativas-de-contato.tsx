"use client";

/**
 * Tentativas de contato do vendedor com o participante do evento.
 *
 * ## Por que existe
 *
 * O Mapa guardava só o status final do lead — pendente, em negociação,
 * negativa. Quem ligou três vezes e nunca foi atendido ficava idêntico a quem
 * ninguém tocou, e o vendedor não tinha onde ver o que já tentou: a informação
 * morava no WhatsApp dele, ou na cabeça.
 *
 * Agora cada tentativa entra numa lista: a quantas vai, por qual canal, se a
 * pessoa respondeu, e quem registrou. O número da tentativa é a posição na
 * lista, então ele nunca discorda do histórico.
 *
 * ## Por que dá para desfazer
 *
 * Registrar é um clique no meio do evento, e sem desfazer o clique errado fica
 * no histórico para sempre — aí o vendedor para de confiar na contagem, que é
 * exatamente o que esta tela entrega. Só a última sai: corrigir é apagar o que
 * você acabou de pôr, não reescrever o passado.
 */

import { useState } from "react";
import { Check, Loader2, Phone, PhoneOff, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useAddEventContactAttempt,
  useUndoEventContactAttempt,
} from "@/lib/hooks/use-event-config";
import type { EventContactAttempt, EventContactChannel } from "@loyola-x/shared";

const CANAIS: { valor: EventContactChannel; rotulo: string }[] = [
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "outro", rotulo: "Outro" },
];

const ROTULO: Record<EventContactChannel, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  outro: "Outro",
};

const ORDINAIS = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª"];
const ordinal = (i: number) => ORDINAIS[i] ?? `${i + 1}ª`;

/**
 * "hoje", "ontem", "há 3 dias" — o vendedor decide se liga de novo pelo tempo
 * desde a última tentativa, não pela data exata.
 */
function quando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function TentativasDeContato({
  projectId,
  funnelId,
  stageId,
  email,
  nome,
  attempts,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  email: string;
  nome: string;
  attempts: EventContactAttempt[];
}) {
  const [aberto, setAberto] = useState(false);
  const [canal, setCanal] = useState<EventContactChannel>("ligacao");
  const [falou, setFalou] = useState(false);
  const [nota, setNota] = useState("");
  const registrar = useAddEventContactAttempt(projectId, funnelId, stageId);
  const desfazer = useUndoEventContactAttempt(projectId, funnelId, stageId);

  const ultima = attempts[attempts.length - 1];

  function enviar() {
    registrar.mutate(
      { email, canal, falou, nota: nota.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(`${ordinal(r.attempts.length - 1)} tentativa registrada`);
          setNota("");
          setFalou(false);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro ao registrar a tentativa"),
      },
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              attempts.length === 0
                ? "border-[#1f2937] bg-[#1a2236] text-[#9ca3af] hover:text-[#f3f4f6]"
                : ultima?.falou
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
            }`}
            title={
              attempts.length === 0
                ? "Nenhuma tentativa de contato registrada"
                : `${attempts.length} tentativa(s) · última ${quando(ultima!.at)}`
            }
          >
            {attempts.length === 0 ? (
              <>
                <Phone className="h-3 w-3" />
                Registrar
              </>
            ) : (
              <>
                {ultima?.falou ? <Check className="h-3 w-3" /> : <PhoneOff className="h-3 w-3" />}
                {attempts.length}× · {quando(ultima!.at)}
              </>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[320px] border-[#1f2937] bg-[#111827] p-3 text-[#f3f4f6]"
        >
          <div className="text-[11px] uppercase tracking-[1px] text-[#6b7280]">
            Tentativas de contato
          </div>
          <div className="truncate text-[13px] font-semibold">{nome || email}</div>

          {attempts.length > 0 && (
            <ul className="mt-2.5 max-h-[180px] space-y-1.5 overflow-y-auto border-t border-[#1f2937] pt-2.5">
              {attempts.map((a, i) => (
                <li key={`${a.at}-${i}`} className="text-[12px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#d4af37]">{ordinal(i)}</span>
                    <span className="text-[#9ca3af]">{ROTULO[a.canal]}</span>
                    <span className={a.falou ? "text-emerald-400" : "text-amber-400"}>
                      {a.falou ? "falou" : "não atendeu"}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-[#6b7280]">
                      {quando(a.at)}
                    </span>
                  </div>
                  {a.nota && <div className="text-[11px] text-[#9ca3af]">{a.nota}</div>}
                  {a.por && <div className="text-[10px] text-[#6b7280]">por {a.por}</div>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 space-y-2 border-t border-[#1f2937] pt-2.5">
            <div className="flex flex-wrap gap-1">
              {CANAIS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCanal(c.valor)}
                  className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    canal === c.valor
                      ? "border-[#d4af37]/50 bg-[#d4af37]/15 text-[#d4af37]"
                      : "border-[#1f2937] bg-[#1a2236] text-[#9ca3af] hover:text-[#f3f4f6]"
                  }`}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#9ca3af]">
              <input
                type="checkbox"
                checked={falou}
                onChange={(e) => setFalou(e.target.checked)}
                className="cursor-pointer accent-[#d4af37]"
              />
              Conseguiu falar com a pessoa
            </label>

            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que foi dito (opcional)"
              maxLength={1000}
              className="h-8 border-[#1f2937] bg-[#1a2236] text-[12px] text-[#f3f4f6]"
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 flex-1 bg-[#d4af37] text-[11px] text-[#111827] hover:bg-[#c49f2f]"
                disabled={registrar.isPending}
                onClick={enviar}
              >
                {registrar.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  `Registrar ${ordinal(attempts.length)} tentativa`
                )}
              </Button>
              {attempts.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-[#1f2937] bg-transparent px-2 text-[11px] text-[#9ca3af]"
                  disabled={desfazer.isPending}
                  title="Desfazer a última tentativa"
                  onClick={() =>
                    desfazer.mutate(email, {
                      onSuccess: () => toast.success("Última tentativa desfeita"),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Erro ao desfazer"),
                    })
                  }
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
