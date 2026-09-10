"use client";

/**
 * Story 47.2 — a casca comum dos formulários do Dicionário.
 *
 * O erro que aparece é o do SERVIDOR, literal (`of02 já existe para bbe: "…".
 * Use of03.`) — a API foi desenhada para falar com quem digita, e reescrever
 * aqui esconderia o que ela sabe. Erro mantém o formulário aberto.
 */

import type { FormEvent, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ErroDaApi } from "@/lib/hooks/use-nomenclatura";

export function FormularioDialogo(props: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  onSalvar: () => void | Promise<void>;
  salvando: boolean;
  podeSalvar: boolean;
  erro: ErroDaApi | null;
  children: ReactNode;
  /** "Salvar e adicionar outra": grava e mantém o formulário aberto com as seleções (pedido do dono, 2026-09-09). */
  onSalvarEOutra?: () => void | Promise<void>;
}) {
  const { aberto, onFechar, titulo, descricao, onSalvar, salvando, podeSalvar, erro, children, onSalvarEOutra } = props;
  function submeter(e: FormEvent) {
    e.preventDefault();
    if (podeSalvar && !salvando) void onSalvar();
  }
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submeter} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-3">{children}</div>
          {erro ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro.mensagem}
              {erro.corpo?.campo ? <span className="ml-1 text-xs opacity-70">(campo: {erro.corpo.campo})</span> : null}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            {onSalvarEOutra ? (
              <Button type="button" variant="secondary" disabled={!podeSalvar || salvando} onClick={() => void onSalvarEOutra()}>
                Salvar e adicionar outra
              </Button>
            ) : null}
            <Button type="submit" disabled={!podeSalvar || salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
