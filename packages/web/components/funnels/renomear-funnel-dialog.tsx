"use client";

/**
 * Renomear o funil — com o preço à vista.
 *
 * O nome do funil não é só um rótulo nesta base: dele saem, por derivação, o
 * token que casa campanhas do Mautic e do SendFlow e o prefixo da pasta de
 * criativos no Drive. Renomear sem ver isso é trocar três coisas achando que
 * se trocou uma — e as duas outras falham em silêncio, servindo menos dado sem
 * dar erro.
 *
 * Por isso o diálogo mostra antes/depois de cada derivação, e oferece congelar
 * o casamento atual no `matchCode` (que existe justamente para isso) quando o
 * token mudaria.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * O token que casa campanha (Mautic, Log, SendFlow): os dois primeiros
 * segmentos. Mesma regra de `funnelMatchToken` na API — replicada aqui só para
 * PREVER o efeito na tela; quem decide continua sendo o servidor.
 */
export function tokenDoNome(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return (segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome.trim()).toLowerCase();
}

/** O prefixo que vira pasta de campanha no Drive: "dg-pg04-jun-26" → "DG-PG04". */
export function prefixoDoDrive(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return (segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome).toUpperCase();
}

function Linha({ rotulo, de, para }: { rotulo: string; de: string; para: string }) {
  const mudou = de !== para;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-1.5 font-mono text-[11px]">
        <code className={mudou ? "opacity-60 line-through" : ""}>{de}</code>
        {mudou && (
          <>
            <ArrowRight className="h-3 w-3 text-amber-500" />
            <code className="font-semibold text-amber-600 dark:text-amber-400">{para}</code>
          </>
        )}
      </span>
    </div>
  );
}

export function RenomearFunnelDialog({
  open,
  onOpenChange,
  nomeAtual,
  matchCodeAtual,
  salvando,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nomeAtual: string;
  matchCodeAtual: string | null;
  salvando: boolean;
  onSalvar: (dados: { name: string; matchCode?: string | null }) => void;
}) {
  const [nome, setNome] = useState(nomeAtual);
  const [congelar, setCongelar] = useState(true);

  useEffect(() => {
    if (open) {
      setNome(nomeAtual);
      setCongelar(true);
    }
  }, [open, nomeAtual]);

  const novo = nome.trim();
  const tokenAntes = matchCodeAtual || tokenDoNome(nomeAtual);
  const tokenDepois = matchCodeAtual || tokenDoNome(novo || nomeAtual);
  // Só há o que congelar quando o token vem do NOME. Com matchCode gravado, o
  // casamento já é independente do nome e a renomeação não o afeta.
  const casamentoMudaria = !matchCodeAtual && tokenAntes !== tokenDepois;
  const driveAntes = prefixoDoDrive(nomeAtual);
  const driveDepois = prefixoDoDrive(novo || nomeAtual);
  const driveMudaria = driveAntes !== driveDepois;

  const podeSalvar = useMemo(
    () => novo.length > 0 && novo !== nomeAtual && !salvando,
    [novo, nomeAtual, salvando],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Renomear funil</DialogTitle>
          <DialogDescription>
            O nome também define como o funil casa com campanhas e onde os criativos são
            procurados. O que muda aparece abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="novo-nome">Nome</Label>
            <Input
              id="novo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={255}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && podeSalvar) {
                  onSalvar({
                    name: novo,
                    ...(casamentoMudaria && congelar ? { matchCode: tokenAntes } : {}),
                  });
                }
              }}
            />
          </div>

          {novo && novo !== nomeAtual && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                O que muda junto
              </p>
              <Linha
                rotulo="Casamento de campanhas (Mautic, Log, SendFlow)"
                de={tokenAntes}
                para={congelar && casamentoMudaria ? tokenAntes : tokenDepois}
              />
              <Linha rotulo="Pasta de criativos no Drive" de={driveAntes} para={driveDepois} />
            </div>
          )}

          {casamentoMudaria && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs">
                  <p className="font-medium">O casamento de campanhas mudaria</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Campanhas que hoje casam por <code className="font-mono">{tokenAntes}</code>{" "}
                    deixariam de casar. Nada dá erro — o funil simplesmente para de receber os
                    disparos e as campanhas órfãs.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pl-6">
                <Label htmlFor="congelar" className="text-xs font-normal">
                  Manter o casamento atual (grava{" "}
                  <code className="font-mono">{tokenAntes}</code> como código de match)
                </Label>
                <Switch id="congelar" checked={congelar} onCheckedChange={setCongelar} />
              </div>
            </div>
          )}

          {driveMudaria && (
            <p className="text-[11px] text-muted-foreground">
              ⚠️ A pasta de criativos passa a ser procurada como{" "}
              <code className="font-mono">{driveDepois}</code> no Drive. Se a pasta lá ainda se
              chama <code className="font-mono">{driveAntes}</code>, a galeria de anúncios fica
              vazia até alguém renomear a pasta — isso não tem override.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            disabled={!podeSalvar}
            onClick={() =>
              onSalvar({
                name: novo,
                ...(casamentoMudaria && congelar ? { matchCode: tokenAntes } : {}),
              })
            }
          >
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Renomear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
