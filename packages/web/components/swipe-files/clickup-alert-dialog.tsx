"use client";

/**
 * Onde se escolhe para qual canal do ClickUp o aviso de referência nova vai.
 *
 * A configuração é **do time**, não de um projeto: o Swipe Files é acervo
 * compartilhado, e um aviso por projeto multiplicaria a mesma mensagem em cinco
 * canais.
 *
 * O botão de teste existe porque a alternativa é subir uma referência de mentira
 * para descobrir se o canal está certo — e aí a referência de mentira fica na
 * biblioteca para sempre.
 */

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAvisoNoClickUp,
  useCanaisDoClickUp,
  useMembrosDoClickUp,
  useSalvarAvisoNoClickUp,
  useTestarAvisoNoClickUp,
} from "@/lib/hooks/use-swipe-files";

/** Canal sem nome é DM ou grupo — não serve para aviso de equipe. */
function apenasCanaisNomeados(canais: { id: string; name?: string }[]) {
  return canais.filter((c): c is { id: string; name: string } => Boolean(c.name));
}

function SeletorDeCanal({
  id,
  label,
  ajuda,
  canais,
  valor,
  onEscolher,
  carregando,
  permiteVazio,
}: {
  id: string;
  label: string;
  ajuda?: string;
  canais: { id: string; name: string }[];
  valor: string | null;
  onEscolher: (canal: { id: string; name: string } | null) => void;
  carregando: boolean;
  permiteVazio?: boolean;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo ? canais.filter((c) => c.name.toLowerCase().includes(termo)) : canais;
    // Os de referência primeiro: é o que se procura aqui em 9 de 10 vezes.
    return [...base]
      .sort((a, b) => {
        const ra = /refer|ref-/i.test(a.name) ? 0 : 1;
        const rb = /refer|ref-/i.test(b.name) ? 0 : 1;
        return ra - rb || a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [canais, busca]);

  const escolhido = canais.find((c) => c.id === valor);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {ajuda && <p className="text-[11px] text-muted-foreground">{ajuda}</p>}

      {escolhido || valor ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {escolhido?.name ?? valor}
          </Badge>
          {permiteVazio && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => onEscolher(null)}>
              <X className="h-3 w-3" />
              limpar
            </Button>
          )}
        </div>
      ) : null}

      <Input
        id={id}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={carregando ? "Carregando canais…" : "Buscar canal…"}
        disabled={carregando}
        className="h-9"
      />

      {busca.trim() && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
          {filtrados.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nenhum canal com esse nome.</p>
          )}
          {filtrados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onEscolher(c);
                setBusca("");
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className="truncate">{c.name}</span>
              {c.id === valor && <Check className="ml-auto h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClickUpAlertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useAvisoNoClickUp();
  const canais = useCanaisDoClickUp(open);
  const membros = useMembrosDoClickUp(open);
  const salvar = useSalvarAvisoNoClickUp();
  const testar = useTestarAvisoNoClickUp();

  const [enabled, setEnabled] = useState(true);
  const [canal, setCanal] = useState<{ id: string; name: string } | null>(null);
  const [canalVideo, setCanalVideo] = useState<{ id: string; name: string } | null>(null);
  const [mencoes, setMencoes] = useState<{ id: string; username: string }[]>([]);
  const [buscaMembro, setBuscaMembro] = useState("");

  useEffect(() => {
    const c = data?.config;
    if (!c) return;
    setEnabled(c.enabled);
    setCanal(c.channelId ? { id: c.channelId, name: c.channelName ?? c.channelId } : null);
    setCanalVideo(
      c.videoChannelId ? { id: c.videoChannelId, name: c.videoChannelName ?? c.videoChannelId } : null,
    );
    setMencoes(c.mentionUsers ?? []);
  }, [data]);

  const listaDeCanais = apenasCanaisNomeados(canais.data?.channels ?? []);
  const podeSalvar = Boolean(canal?.id) && !salvar.isPending;

  async function gravar() {
    if (!canal) return;
    try {
      await salvar.mutateAsync({
        enabled,
        channelId: canal.id,
        channelName: canal.name,
        videoChannelId: canalVideo?.id ?? null,
        videoChannelName: canalVideo?.name ?? null,
        mentionUsers: mencoes,
      });
      toast.success("Aviso configurado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    }
  }

  async function mandarTeste() {
    try {
      await testar.mutateAsync();
      toast.success(`Mensagem de teste enviada${canal ? ` para ${canal.name}` : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar o teste");
    }
  }

  const membrosFiltrados = useMemo(() => {
    const termo = buscaMembro.trim().toLowerCase();
    if (!termo) return [];
    return (membros.data?.members ?? [])
      .filter((m) => m.username.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [membros.data, buscaMembro]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Avisar no ClickUp
          </DialogTitle>
          <DialogDescription>
            Toda referência nova vira uma mensagem no canal escolhido. A configuração é do time — o
            acervo não é por projeto.
          </DialogDescription>
        </DialogHeader>

        {data && !data.clickupPronto ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            O ClickUp não está configurado no servidor. Sem isso não dá para enviar aviso nenhum.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
              Avisar quando entrar referência nova
            </label>

            <SeletorDeCanal
              id="canal-padrao"
              label="Canal"
              ajuda="Recebe tudo que não for vídeo."
              canais={listaDeCanais}
              valor={canal?.id ?? null}
              onEscolher={setCanal}
              carregando={canais.isLoading}
            />

            <SeletorDeCanal
              id="canal-video"
              label="Canal de vídeo (opcional)"
              ajuda="Sem isto, vídeo vai junto com o resto."
              canais={listaDeCanais}
              valor={canalVideo?.id ?? null}
              onEscolher={setCanalVideo}
              carregando={canais.isLoading}
              permiteVazio
            />

            <div className="space-y-1.5">
              <Label htmlFor="mencoes">Notificar (opcional)</Label>
              <p className="text-[11px] text-muted-foreground">
                O ClickUp não faz menção dentro do texto: a primeira pessoa recebe a mensagem
                atribuída, as demais entram como seguidoras.
              </p>
              {mencoes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {mencoes.map((m) => (
                    <Badge
                      key={m.id}
                      variant="secondary"
                      className="cursor-pointer gap-1"
                      onClick={() => setMencoes((a) => a.filter((x) => x.id !== m.id))}
                    >
                      {m.username}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
              <Input
                id="mencoes"
                value={buscaMembro}
                onChange={(e) => setBuscaMembro(e.target.value)}
                placeholder="Buscar pessoa…"
                className="h-9"
              />
              {membrosFiltrados.length > 0 && (
                <div className="space-y-0.5 rounded-md border p-1">
                  {membrosFiltrados.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        // Dez é o teto de followers da API de chat do ClickUp.
                        setMencoes((a) =>
                          a.some((x) => x.id === m.id) || a.length >= 10
                            ? a
                            : [...a, { id: m.id, username: m.username }],
                        );
                        setBuscaMembro("");
                      }}
                      className="flex w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      {m.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {data?.config && (
            <Button variant="outline" onClick={mandarTeste} disabled={testar.isPending}>
              {testar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Enviar teste
            </Button>
          )}
          <Button onClick={gravar} disabled={!podeSalvar || isLoading}>
            {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
