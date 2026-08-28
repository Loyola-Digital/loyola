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

/**
 * O token que casa campanha (Mautic, Log, SendFlow): os dois primeiros
 * segmentos. Mesma regra de `funnelMatchToken` na API — replicada aqui só para
 * PREVER o efeito na tela; quem decide continua sendo o servidor.
 */
export function tokenDoNome(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return (segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome.trim()).toLowerCase();
}

/**
 * Tokens plausíveis para o casamento, do mais curto ao mais longo.
 *
 * A regra automática pega DOIS segmentos, o que serve para lançamento
 * (`dg-pg04-jun-26` → `dg-pg04`) e é ambígua no perpétuo: `bbe-fc1-a1` e
 * `bbe-fc1-a2` são funis diferentes que colapsam no mesmo `bbe-fc1`. Por isso
 * a tela oferece o de três segmentos ao lado do automático, em vez de deixar
 * quem renomeia descobrir a colisão depois — quando o sintoma é campanha
 * chegando no funil errado, que não dá erro nenhum.
 */
export function sugestoesDeToken(nome: string): string[] {
  const segs = nome.trim().split("-").filter(Boolean);
  const opcoes: string[] = [];
  for (const n of [2, 3]) {
    if (segs.length >= n) opcoes.push(segs.slice(0, n).join("-").toLowerCase());
  }
  if (opcoes.length === 0 && nome.trim()) opcoes.push(nome.trim().toLowerCase());
  return [...new Set(opcoes)];
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
  /**
   * O token que vai valer depois de salvar.
   *
   * Começa no atual (congelar é o padrão: renomear costuma ser corrigir o
   * rótulo, não mudar a que campanhas o funil responde), mas é EDITÁVEL —
   * porque o token automático pode estar simplesmente errado para o funil, e
   * era o caso do perpétuo com a1/a2.
   */
  const [token, setToken] = useState("");

  useEffect(() => {
    if (open) {
      setNome(nomeAtual);
      setToken(matchCodeAtual || tokenDoNome(nomeAtual));
    }
  }, [open, nomeAtual, matchCodeAtual]);

  const novo = nome.trim();
  const tokenAntes = matchCodeAtual || tokenDoNome(nomeAtual);
  const tokenAutomatico = tokenDoNome(novo || nomeAtual);
  const escolhido = token.trim().toLowerCase();
  // Sugestões: o que vale hoje, o automático do nome novo e o de três
  // segmentos (o que distingue a1 de a2).
  const sugestoes = useMemo(
    () => [...new Set([tokenAntes, ...sugestoesDeToken(novo || nomeAtual)])].filter(Boolean),
    [tokenAntes, novo, nomeAtual],
  );
  // Precisa gravar matchCode? Só quando o token escolhido difere do que a regra
  // automática produziria — senão o campo fica sujo à toa.
  const precisaMatchCode = escolhido !== tokenAutomatico;
  const casamentoMuda = escolhido !== tokenAntes;
  const driveAntes = prefixoDoDrive(nomeAtual);
  const driveDepois = prefixoDoDrive(novo || nomeAtual);
  const driveMudaria = driveAntes !== driveDepois;

  function dadosParaSalvar() {
    return {
      name: novo,
      // null limpa o override e devolve o casamento à regra automática.
      matchCode: precisaMatchCode ? escolhido : null,
    };
  }

  const podeSalvar = useMemo(
    // Token vazio bloqueia: sem ele o funil não casa com nada.
    () => novo.length > 0 && novo !== nomeAtual && escolhido.length > 0 && !salvando,
    [novo, nomeAtual, escolhido, salvando],
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
                if (e.key === "Enter" && podeSalvar) onSalvar(dadosParaSalvar());
              }}
            />
          </div>

          {novo && novo !== nomeAtual && (
            <>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  O que muda junto
                </p>
                <Linha
                  rotulo="Casamento de campanhas (Mautic, Log, SendFlow)"
                  de={tokenAntes}
                  para={escolhido}
                />
                <Linha rotulo="Pasta de criativos no Drive" de={driveAntes} para={driveDepois} />
              </div>

              <div className="space-y-2 rounded-lg border border-border/50 p-3">
                <div>
                  <Label htmlFor="token" className="text-xs">
                    Código de match
                  </Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    É por ele que campanha, disparo e lead encontram este funil. A regra
                    automática usa os dois primeiros segmentos do nome — o que basta para
                    lançamento e é <strong>ambíguo no perpétuo</strong>, onde{" "}
                    <code className="font-mono">a1</code> e <code className="font-mono">a2</code>{" "}
                    virariam o mesmo código.
                  </p>
                </div>
                <Input
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  maxLength={50}
                  className="h-8 font-mono text-sm"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {sugestoes.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setToken(sug)}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                        escolhido === sug
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {sug}
                      {sug === tokenAntes && <span className="ml-1 font-sans opacity-60">atual</span>}
                      {sug === tokenAutomatico && sug !== tokenAntes && (
                        <span className="ml-1 font-sans opacity-60">automático</span>
                      )}
                    </button>
                  ))}
                </div>
                {precisaMatchCode && escolhido && (
                  <p className="text-[11px] text-muted-foreground">
                    Fica gravado como override — o nome pode mudar de novo sem mexer no
                    casamento.
                  </p>
                )}
                {!escolhido && (
                  <p className="text-[11px] text-destructive">
                    Sem código de match o funil não recebe campanha nenhuma.
                  </p>
                )}
              </div>

              {casamentoMuda && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-muted-foreground">
                    Campanhas que hoje casam por{" "}
                    <code className="font-mono">{tokenAntes}</code> deixam de casar. Nada dá
                    erro — o funil simplesmente para de receber os disparos e as campanhas
                    órfãs.
                  </p>
                </div>
              )}
            </>
          )}

          {driveMudaria && novo !== nomeAtual && (
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
            onClick={() => onSalvar(dadosParaSalvar())}
          >
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Renomear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
