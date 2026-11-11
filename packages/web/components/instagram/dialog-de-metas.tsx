"use client";

/**
 * Onde as metas do mês são escritas.
 *
 * Campo vazio é "sem meta", não zero: zero seria uma meta — e uma meta de zero
 * pinta de verde qualquer resultado. O que fica vazio simplesmente não aparece
 * no semáforo.
 */

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSalvarMetas, type ItemDoPlano, type MetaDoMes } from "@/lib/hooks/use-instagram-metas";
import type { Formato } from "@/lib/utils/instagram-posts";
import { NOME_DO_FORMATO } from "@/lib/utils/instagram-posts";
import { rotuloDoMes } from "@/lib/utils/meses-do-instagram";

interface Props {
  accountId: string | null;
  mes: string;
  atual: MetaDoMes | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const FORMATOS: Formato[] = ["reels", "carrossel", "estatico"];

/** Texto → número, com vírgula decimal. Vazio vira null: "sem meta". */
function numero(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: number | null | undefined) =>
  v == null ? "" : String(v).replace(".", ",");

export function DialogDeMetas({ accountId, mes, atual, open, onOpenChange }: Props) {
  const salvar = useSalvarMetas(accountId);
  const [mesCampos, setMesCampos] = useState({ saldo: "", alcance: "", posts: "" });
  const [porFormato, setPorFormato] = useState<Record<string, { freq: string; alcance: string; interesse: string }>>({});
  const [frases, setFrases] = useState({ onde: "", aprendizado: "", prioridade: "" });
  const [plano, setPlano] = useState<ItemDoPlano[]>([]);

  // Reabrir o diálogo tem de mostrar o que está gravado, não o que foi digitado
  // e descartado da última vez.
  useEffect(() => {
    if (!open) return;
    setMesCampos({
      saldo: texto(atual?.saldoSeguidores),
      alcance: texto(atual?.alcance),
      posts: texto(atual?.posts),
    });
    const f: Record<string, { freq: string; alcance: string; interesse: string }> = {};
    for (const formato of FORMATOS) {
      const m = atual?.metasPorFormato?.[formato];
      f[formato] = { freq: texto(m?.freq), alcance: texto(m?.alcance), interesse: texto(m?.interesse) };
    }
    setPorFormato(f);
    setFrases({
      onde: atual?.resumoOndeEstamos ?? "",
      aprendizado: atual?.resumoAprendizado ?? "",
      prioridade: atual?.resumoPrioridade ?? "",
    });
    // Três linhas sempre visíveis: um botão "adicionar" para três itens fixos
    // seria um clique a mais para nada.
    const p = [...(atual?.plano ?? [])];
    while (p.length < 3) p.push({ oQue: "", responsavel: "", prazo: "" });
    setPlano(p.slice(0, 3));
  }, [open, atual]);

  function gravar() {
    const metasPorFormato: Record<string, { freq: number | null; alcance: number | null; interesse: number | null }> = {};
    let algumFormato = false;
    for (const formato of FORMATOS) {
      const c = porFormato[formato] ?? { freq: "", alcance: "", interesse: "" };
      const linha = { freq: numero(c.freq), alcance: numero(c.alcance), interesse: numero(c.interesse) };
      if (linha.freq != null || linha.alcance != null || linha.interesse != null) {
        metasPorFormato[formato] = linha;
        algumFormato = true;
      }
    }

    salvar.mutate(
      {
        mes,
        saldoSeguidores: numero(mesCampos.saldo),
        alcance: numero(mesCampos.alcance),
        posts: numero(mesCampos.posts),
        metasPorFormato: algumFormato ? metasPorFormato : null,
        resumoOndeEstamos: frases.onde.trim() || null,
        resumoAprendizado: frases.aprendizado.trim() || null,
        resumoPrioridade: frases.prioridade.trim() || null,
        plano: (() => {
          const itens = plano
            .filter((p) => p.oQue.trim())
            .map((p) => ({
              oQue: p.oQue.trim(),
              responsavel: p.responsavel?.trim() || undefined,
              prazo: p.prazo?.trim() || undefined,
              status: p.status,
            }));
          return itens.length > 0 ? itens : null;
        })(),
      },
      {
        onSuccess: () => {
          toast.success(`Metas de ${rotuloDoMes(mes)} salvas`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui salvar"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Metas de {rotuloDoMes(mes)}</DialogTitle>
          <DialogDescription>
            Campo em branco é &ldquo;sem meta&rdquo; — o número aparece na tela, mas sem cor e sem
            cobrança. Uma meta de zero deixaria qualquer resultado verde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="meta-saldo">Saldo de seguidores</Label>
              <Input
                id="meta-saldo"
                inputMode="numeric"
                placeholder="1.500"
                value={mesCampos.saldo}
                onChange={(e) => setMesCampos((v) => ({ ...v, saldo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-alcance">Alcance do mês</Label>
              <Input
                id="meta-alcance"
                inputMode="numeric"
                placeholder="500000"
                value={mesCampos.alcance}
                onChange={(e) => setMesCampos((v) => ({ ...v, alcance: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-posts">Posts publicados</Label>
              <Input
                id="meta-posts"
                inputMode="numeric"
                placeholder="30"
                value={mesCampos.posts}
                onChange={(e) => setMesCampos((v) => ({ ...v, posts: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium">Por formato</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Posts por semana, alcance mediano por post e interesse por mil. A cor de cada formato
              é a pior das três.
            </p>
            <div className="space-y-3">
              {FORMATOS.map((formato) => (
                <div key={formato} className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_1fr] sm:items-center">
                  <span className="text-sm">{NOME_DO_FORMATO[formato]}</span>
                  {(["freq", "alcance", "interesse"] as const).map((chave) => (
                    <Input
                      key={chave}
                      inputMode="decimal"
                      aria-label={`${NOME_DO_FORMATO[formato]} — ${
                        chave === "freq" ? "posts por semana" : chave === "alcance" ? "alcance mediano" : "interesse por mil"
                      }`}
                      placeholder={chave === "freq" ? "por semana" : chave === "alcance" ? "alcance" : "interesse"}
                      value={porFormato[formato]?.[chave] ?? ""}
                      onChange={(e) =>
                        setPorFormato((v) => ({
                          ...v,
                          [formato]: { ...(v[formato] ?? { freq: "", alcance: "", interesse: "" }), [chave]: e.target.value },
                        }))
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium">As três frases do relatório</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              É a leitura que nenhum número produz sozinho, e a primeira coisa que o cliente lê.
            </p>
            <div className="space-y-2.5">
              {(
                [
                  ["onde", "Onde estamos", "Outubro foi o mês de maior alcance do ano…"],
                  ["aprendizado", "O que aprendemos", "O que mais se espalha são os assuntos de…"],
                  ["prioridade", "A prioridade seguinte", "Transformar quem vê em quem fica…"],
                ] as const
              ).map(([chave, rotulo, exemplo]) => (
                <div key={chave} className="space-y-1.5">
                  <Label htmlFor={`frase-${chave}`}>{rotulo}</Label>
                  <Textarea
                    id={`frase-${chave}`}
                    rows={2}
                    placeholder={exemplo}
                    value={frases[chave]}
                    onChange={(e) => setFrases((v) => ({ ...v, [chave]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium">Próximos passos</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              No máximo três, cada um com responsável e prazo — sem isso o relatório termina sem
              ninguém dono de nada.
            </p>
            <div className="space-y-2">
              {plano.map((item, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem]">
                  <Input
                    aria-label={`Prioridade ${i + 1}`}
                    placeholder="O que fazer"
                    value={item.oQue}
                    onChange={(e) =>
                      setPlano((v) => v.map((x, j) => (j === i ? { ...x, oQue: e.target.value } : x)))
                    }
                  />
                  <Input
                    aria-label={`Responsável pela prioridade ${i + 1}`}
                    placeholder="Quem"
                    value={item.responsavel ?? ""}
                    onChange={(e) =>
                      setPlano((v) => v.map((x, j) => (j === i ? { ...x, responsavel: e.target.value } : x)))
                    }
                  />
                  <Input
                    aria-label={`Prazo da prioridade ${i + 1}`}
                    placeholder="Até quando"
                    value={item.prazo ?? ""}
                    onChange={(e) =>
                      setPlano((v) => v.map((x, j) => (j === i ? { ...x, prazo: e.target.value } : x)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar metas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
