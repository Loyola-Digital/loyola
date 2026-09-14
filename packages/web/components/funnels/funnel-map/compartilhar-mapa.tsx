"use client";

/**
 * Compartilhar o mapa por link público.
 *
 * ## Por que link, e não convite
 *
 * Quem precisa ver o mapa é o cliente, o expert, alguém numa call — gente sem
 * conta no Loyola X. Convite exigiria cadastro, aprovação e projeto para uma
 * pessoa que só quer olhar um desenho. O link resolve com uma URL.
 *
 * ## O que a tela precisa deixar claro
 *
 * **Quem tem o link vê** — sem senha, sem login. Isso é o recurso e é o risco,
 * então vai escrito junto do botão, não escondido numa ajuda.
 *
 * **Revogar mata o link na hora**, e compartilhar de novo gera OUTRO: o
 * anterior nunca volta a valer. É a resposta para "mandei para a pessoa
 * errada".
 */

import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useLigarLink,
  useLinkDoMapa,
  useRevogarLink,
} from "@/lib/hooks/use-funnel-map";

/** O endereço que vai para a área de transferência. */
function urlDoLink(token: string): string {
  // `window` só existe no navegador; o componente é client, mas o guard evita
  // quebrar se algum dia renderizar no servidor.
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  return `${origem}/m/${token}`;
}

export function BotaoDeCompartilhar({ mapId }: { mapId: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const { data, isLoading } = useLinkDoMapa(aberto ? mapId : null);
  const ligar = useLigarLink(mapId);
  const revogar = useRevogarLink(mapId);

  const token = data?.token ?? null;
  const url = token ? urlDoLink(token) : null;

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Área de transferência bloqueada (http, permissão negada). O campo fica
      // selecionável, então copiar à mão continua possível.
      toast.error("Não consegui copiar — selecione o link e copie à mão.");
    }
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          /* Mapa nunca salvo não tem id — não há o que compartilhar ainda. */
          disabled={!mapId}
          aria-label="Compartilhar por link"
          title={
            mapId
              ? "Compartilhar por link"
              : "Salve o mapa para poder compartilhar"
          }
        >
          <Share2 className="h-3 w-3" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Link2 className="h-3.5 w-3.5" />
            Link público
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            <strong className="text-foreground">
              Quem tiver o link vê o mapa
            </strong>
            , sem login. Ele acompanha as edições ao vivo, mas não consegue
            mexer em nada nem ver os comentários.
          </p>
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando…
          </p>
        ) : url ? (
          <>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link público do mapa"
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-2 font-mono text-[11px] outline-none"
              />
              <Button
                size="sm"
                className="h-8 gap-1 px-2"
                onClick={() => copiar(url)}
              >
                {copiado ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Ver como a pessoa vê
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={revogar.isPending}
                onClick={() =>
                  revogar.mutate(undefined, {
                    onSuccess: () =>
                      toast.success("Link revogado — quem tinha não abre mais"),
                    onError: (e) =>
                      toast.error(
                        e instanceof Error ? e.message : "Não consegui revogar",
                      ),
                  })
                }
              >
                {revogar.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Revogar
              </Button>
            </div>
          </>
        ) : (
          <Button
            size="sm"
            className="h-8 w-full gap-1.5"
            disabled={ligar.isPending}
            onClick={() =>
              ligar.mutate(undefined, {
                onSuccess: (r) => void copiar(urlDoLink(r.token)),
                onError: (e) =>
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Não consegui criar o link",
                  ),
              })
            }
          >
            {ligar.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Criar link e copiar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
