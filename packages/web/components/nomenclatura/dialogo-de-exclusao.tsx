"use client";

/**
 * Story 47.2 — excluir ou, quando não dá, desativar (spec § 5).
 *
 * Fluxo: confirma → `DELETE`. Se a API devolver 409 com `referencias`, o
 * diálogo troca de cara: lista o que referencia (LPs, campanhas, filhos) e
 * oferece "Desativar em vez de excluir". Para expert, a desativação é em
 * cascata e a confirmação diz quantos filhos vão junto — número que vem da
 * rota `impacto-da-desativacao`, não de uma conta feita na tela.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  erroDaApi,
  useAlternarAtivo,
  useExcluir,
  useImpactoDaDesativacao,
  type Recurso,
  type Referencia,
} from "@/lib/hooks/use-nomenclatura";
import { textoDaCascata } from "@/lib/utils/nomenclatura-cascata";

export interface AlvoDaExclusao {
  recurso: Recurso;
  id: string;
  rotulo: string;
  /** Quando já se sabe que é desativação (botão "Desativar" da tabela). */
  soDesativar?: boolean;
}

export function DialogoDeExclusao(props: { alvo: AlvoDaExclusao | null; onFechar: () => void }) {
  const { alvo, onFechar } = props;
  const excluir = useExcluir(alvo?.recurso ?? "experts");
  const alternar = useAlternarAtivo(alvo?.recurso ?? "experts");
  const [referencias, setReferencias] = useState<Referencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ehExpert = alvo?.recurso === "experts";
  const impacto = useImpactoDaDesativacao(ehExpert && alvo ? alvo.id : null);

  useEffect(() => {
    setReferencias(alvo?.soDesativar ? [] : null);
    setErro(null);
  }, [alvo]);

  if (!alvo) return null;
  const ocupado = excluir.isPending || alternar.isPending;
  const modoDesativar = referencias !== null;

  async function confirmarExclusao() {
    try {
      await excluir.mutateAsync(alvo!.id);
      toast.success(`${alvo!.rotulo} excluído.`);
      onFechar();
    } catch (e) {
      const err = erroDaApi(e);
      if (err.status === 409 && err.corpo?.referencias) {
        setReferencias(err.corpo.referencias);
        setErro(err.mensagem);
      } else {
        setErro(err.mensagem);
      }
    }
  }

  async function confirmarDesativacao() {
    try {
      await alternar.mutateAsync({ id: alvo!.id, ativo: false });
      toast.success(`${alvo!.rotulo} desativado. Some dos selects do gerador; pode ser reativado em "Mostrar inativos".`);
      onFechar();
    } catch (e) {
      setErro(erroDaApi(e).mensagem);
    }
  }

  const textoDeDesativacao = ehExpert
    ? impacto.data
      ? textoDaCascata(alvo.rotulo, impacto.data)
      : "Contando o que vai junto…"
    : `Desativar ${alvo.rotulo}? Some dos selects do gerador, continua no cadastro em "Mostrar inativos" e pode ser reativado.`;

  return (
    <AlertDialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{modoDesativar ? `Desativar ${alvo.rotulo}` : `Excluir ${alvo.rotulo}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {modoDesativar ? (
                <>
                  {referencias && referencias.length > 0 ? (
                    <>
                      <p>Não dá para excluir: está referenciado por</p>
                      <ul className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-xs">
                        {referencias.map((r) => (
                          <li key={`${r.tipo}-${r.id}`} className="flex items-center gap-2 py-0.5">
                            <Badge variant="outline" className="font-sans">
                              {r.tipo}
                            </Badge>
                            {r.rotulo}
                          </li>
                        ))}
                      </ul>
                      <p>O código não pode ser reaproveitado (regra 4). O que dá para fazer é desativar.</p>
                    </>
                  ) : null}
                  <p className="font-medium text-foreground">{textoDeDesativacao}</p>
                </>
              ) : (
                <p>Só apaga de verdade o que nada referencia. Se houver campanha, LP ou cadastro filho, a exclusão é bloqueada e você poderá desativar.</p>
              )}
              {erro && !modoDesativar ? <p className="text-destructive">{erro}</p> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          {modoDesativar ? (
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmarDesativacao(); }} disabled={ocupado || (ehExpert && !impacto.data)}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Desativar
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmarExclusao(); }} disabled={ocupado}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
