"use client";

/**
 * Importar o formulário do Tally para começar o modelo de Lead Scoring.
 *
 * ## Por que existe
 *
 * O motor de scoring do Loyola X é bom: pontua resposta a resposta, aplica
 * peso, classifica em faixas e cruza a faixa com campanha, conjunto e criativo.
 * O que faltava era de onde o modelo VEM — a aba pede o JSON pronto, e esse
 * JSON era transcrito à mão num fluxo do n8n. Trocar uma pergunta do formulário
 * virava reescrever JSON em outro lugar e colar de volta.
 *
 * Aqui o formulário é lido do próprio Tally e vira o rascunho: todas as
 * perguntas, todas as alternativas, na forma exata que o motor lê.
 *
 * ## Os pontos vêm ZERADOS, de propósito
 *
 * Quanto vale "faturamento acima de R$ 100 mil" é conhecimento do negócio, não
 * do formulário. Um palpite plausível aqui seria pior que um zero visível —
 * ninguém revisaria um número que já parece certo.
 */

import { useState } from "react";
import { Download, ExternalLink, FileQuestion, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
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
import {
  useSalvarChaveDoTally,
  useTallyConnection,
  useTallyForms,
  useTallyQuestions,
} from "@/lib/hooks/use-tally";

export function ImportarDoTally({
  projectId,
  onImportar,
}: {
  projectId: string;
  /** Recebe o rascunho já serializado, pronto para o editor de schema. */
  onImportar: (json: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState("");
  const [formId, setFormId] = useState<string | null>(null);

  const conexao = useTallyConnection(aberto ? projectId : null);
  const conectado = conexao.data?.conectado ?? false;
  const salvarChave = useSalvarChaveDoTally(projectId);
  const forms = useTallyForms(aberto ? projectId : null, conectado);
  const questions = useTallyQuestions(projectId, formId);

  function conectar() {
    const t = chave.trim();
    if (t.length < 10) return;
    salvarChave.mutate(t, {
      onSuccess: (r) => {
        setChave("");
        toast.success(`Tally conectado — ${r.formularios} formulário(s) encontrado(s)`);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui conectar"),
    });
  }

  function importar() {
    const rascunho = questions.data?.rascunho;
    if (!rascunho) return;
    onImportar(JSON.stringify(rascunho, null, 2));
    setAberto(false);
    const n = questions.data?.perguntas.length ?? 0;
    toast.success(`${n} pergunta(s) importada(s) — agora preencha os pontos`);
  }

  const perguntas = questions.data?.perguntas ?? [];
  const comAlternativa = perguntas.filter((p) => p.opcoes.length > 0).length;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto(true)}>
        <Download className="h-3.5 w-3.5" />
        Importar do Tally
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar formulário do Tally</DialogTitle>
            <DialogDescription>
              As perguntas e as alternativas viram o rascunho do modelo. Os pontos chegam
              zerados — quem conhece o lançamento é que sabe quanto vale cada resposta.
            </DialogDescription>
          </DialogHeader>

          {conexao.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando a conexão…
            </p>
          ) : !conectado ? (
            <div className="space-y-2">
              <Label htmlFor="chave-tally" className="flex items-center gap-1.5">
                <Plug className="h-3.5 w-3.5" />
                Chave da API do Tally
              </Label>
              <Input
                id="chave-tally"
                type="password"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder="tally_..."
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Em tally.so → Settings → API. A chave é guardada cifrada e nunca volta para
                esta tela.{" "}
                <a
                  href="https://tally.so/help/api"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline"
                >
                  Como gerar <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <Button size="sm" onClick={conectar} disabled={salvarChave.isPending || chave.trim().length < 10}>
                {salvarChave.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Conferindo a chave…
                  </>
                ) : (
                  "Conectar"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Formulário</Label>
                {forms.isLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando os formulários…
                  </p>
                ) : forms.error ? (
                  <p className="text-sm text-destructive">
                    {forms.error instanceof Error ? forms.error.message : "Não consegui listar."}
                  </p>
                ) : (forms.data?.forms.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum formulário nesta conta do Tally.
                  </p>
                ) : (
                  <select
                    value={formId ?? ""}
                    onChange={(e) => setFormId(e.target.value || null)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Escolha o formulário…</option>
                    {forms.data?.forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.respostas} resposta{f.respostas === 1 ? "" : "s"})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {formId && questions.isLoading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lendo as perguntas…
                </p>
              )}

              {formId && questions.error && (
                <p className="text-sm text-destructive">
                  {questions.error instanceof Error ? questions.error.message : "Não consegui ler."}
                </p>
              )}

              {perguntas.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <FileQuestion className="h-3.5 w-3.5" />
                    {perguntas.length} pergunta(s) · {comAlternativa} com alternativa para pontuar
                  </p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {perguntas.map((p) => (
                      <li key={p.id} className="text-xs">
                        <span className="font-medium">{p.titulo}</span>
                        {p.opcoes.length > 0 ? (
                          <span className="text-muted-foreground"> — {p.opcoes.join(" · ")}</span>
                        ) : (
                          // Campo aberto entra no modelo mas não pontua sozinho:
                          // dizer isso aqui evita a pergunta "por que essa ficou zerada".
                          <span className="text-muted-foreground"> — resposta aberta, não pontua</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={importar} disabled={perguntas.length === 0}>
              Importar {perguntas.length > 0 ? `${perguntas.length} pergunta(s)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
