"use client";

/**
 * Receber as respostas da pesquisa por webhook, sem Tally e sem planilha.
 *
 * ## O que esta tela resolve
 *
 * Hoje a etapa lê as respostas do Tally ou de uma planilha do Google. Quem usa
 * outro formulário precisava de um fluxo no n8n escrevendo numa planilha só
 * para o X poder ler. Aqui o envio vem direto.
 *
 * ## Por que começa colando um exemplo
 *
 * As colunas da pesquisa são as PERGUNTAS de quem envia — o X não tem como
 * adivinhá-las. Então a conversa é essa: você cola o corpo como vai mandar, e
 * a tela mostra coluna por coluna onde cada campo vai cair, inclusive quais
 * perguntas do modelo de scoring casaram. Se algo ficar como "não usado", dá
 * para corrigir o alias no modelo (ou o nome do campo na origem) ANTES de a
 * primeira resposta chegar, e não depois de a faixa sair errada.
 */

import { useState } from "react";
import { ArrowRight, Check, Copy, Link2, RefreshCw, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCriarPesquisaPorWebhook,
  usePesquisaPorWebhook,
  usePreviaDoWebhook,
  useRotacionarPesquisaPorWebhook,
  type ColunaDaPrevia,
  type PesquisaPorWebhook,
  type PreviaDoWebhook,
} from "@/lib/hooks/use-webhook-pesquisa";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const EXEMPLO_PLACEHOLDER = `{
  "email": "ana@exemplo.com",
  "telefone": "11999990000",
  "Qual seu faturamento mensal?": "Acima de 100 mil",
  "Qual sua profissão?": "Dentista"
}`;

function urlCompleta(p: Pick<PesquisaPorWebhook, "path" | "token">): string | null {
  if (!p.token) return null;
  return `${API_URL}${p.path}?token=${p.token}`;
}

/** Os rótulos dos campos de contato, como a pessoa os chama. */
const CONTATO: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  telefone: "Telefone",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmTerm: "utm_term",
};

function Destino({ destino }: { destino: ColunaDaPrevia["destino"] }) {
  if (destino.tipo === "data") {
    return <span className="text-muted-foreground">Data da resposta (preenchida aqui)</span>;
  }
  if (destino.tipo === "pergunta") {
    return (
      <span className="text-emerald-600 dark:text-emerald-400">
        Pontua: {destino.rotulo}
      </span>
    );
  }
  if (destino.tipo === "contato") {
    return <span className="text-sky-600 dark:text-sky-400">{CONTATO[destino.campo] ?? destino.campo}</span>;
  }
  return <span className="text-muted-foreground/70">Guardada, não usada no cálculo</span>;
}

/** O mapeamento de contato que a prévia revelou, para gravar junto na criação. */
function mapeamentoDaPrevia(previa: PreviaDoWebhook): Record<string, string> {
  const porCampo: Record<string, string> = { timestamp: "recebido_em" };
  const chaves: Record<string, string> = {
    email: "email",
    telefone: "phone",
    utmSource: "utm_source",
    utmMedium: "utm_medium",
    utmCampaign: "utm_campaign",
    utmContent: "utm_content",
  };
  for (const c of previa.colunas) {
    if (c.destino.tipo !== "contato") continue;
    const alvo = chaves[c.destino.campo];
    // A primeira coluna de cada campo ganha, como na recepção.
    if (alvo && !porCampo[alvo]) porCampo[alvo] = c.coluna;
  }
  return porCampo;
}

interface Props {
  projectId: string;
  funnelId: string;
  stageId?: string;
  /** A pesquisa por webhook já existente. `null` abre em modo de criação. */
  surveyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com o id da pesquisa recém-criada, para a aba já selecioná-la. */
  onCriada?: (surveyId: string) => void;
}

export function WebhookPesquisaDialog({
  projectId,
  funnelId,
  stageId,
  surveyId,
  open,
  onOpenChange,
  onCriada,
}: Props) {
  const [exemplo, setExemplo] = useState("");
  const [label, setLabel] = useState("Pesquisa por webhook");
  const [copiado, setCopiado] = useState(false);
  // A pesquisa recém-criada: o POST já devolve a URL, e esperar o GET
  // invalidado deixaria a pessoa olhando um vazio depois de clicar em Criar.
  const [criada, setCriada] = useState<PesquisaPorWebhook | null>(null);

  const existente = usePesquisaPorWebhook(projectId, funnelId, open ? surveyId : null);
  const previa = usePreviaDoWebhook(projectId, funnelId);
  const criar = useCriarPesquisaPorWebhook(projectId, funnelId);
  const rotacionar = useRotacionarPesquisaPorWebhook(projectId, funnelId);

  const pesquisa = criada ?? existente.data ?? null;
  const url = pesquisa ? urlCompleta(pesquisa) : null;

  function fechar() {
    setCriada(null);
    setCopiado(false);
    setExemplo("");
    previa.reset();
    onOpenChange(false);
  }

  function verPrevia() {
    const corpo = exemplo.trim();
    if (!corpo) return;
    previa.mutate(
      { exemplo: corpo, stageId },
      {
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Não consegui ler esse exemplo"),
      },
    );
  }

  function criarFonte() {
    criar.mutate(
      {
        stageId,
        label: label.trim() || "Pesquisa por webhook",
        columnMapping: previa.data ? mapeamentoDaPrevia(previa.data) : undefined,
      },
      {
        onSuccess: (r) => {
          setCriada(r);
          onCriada?.(r.survey.id);
          toast.success("Pesquisa criada — cole a URL na sua ferramenta");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui criar"),
      },
    );
  }

  async function copiar() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Respostas por webhook
          </DialogTitle>
          <DialogDescription>
            Cole um exemplo do corpo que você vai enviar. A tela mostra, campo por campo,
            como as respostas vão ser lidas aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ---- o exemplo ---- */}
          <div className="space-y-2">
            <Label htmlFor="exemplo-webhook">Como você vai enviar</Label>
            <Textarea
              id="exemplo-webhook"
              value={exemplo}
              onChange={(e) => setExemplo(e.target.value)}
              placeholder={EXEMPLO_PLACEHOLDER}
              rows={8}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                JSON ou os pares <code className="font-mono">a=b&amp;c=d</code> do formulário.
                Nada é gravado neste passo.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={verPrevia}
                disabled={!exemplo.trim() || previa.isPending}
              >
                {previa.isPending ? "Lendo..." : "Ver como vamos ler"}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* ---- a prévia ---- */}
          {previa.data && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Como vamos ler</Label>
                <p className="text-[11px] text-muted-foreground">
                  {previa.data.semModelo
                    ? "Sem modelo de scoring nesta etapa — só os campos de contato foram reconhecidos."
                    : `${previa.data.perguntasCasadas} pergunta(s) do modelo casaram com uma coluna.`}
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Campo recebido</th>
                      <th className="px-3 py-2 font-medium">Exemplo</th>
                      <th className="px-3 py-2 font-medium">Vira o quê</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.data.colunas.map((c) => (
                      <tr key={c.coluna} className="border-t border-border/30">
                        <td className="px-3 py-2 font-mono text-[11px]">{c.coluna}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground">
                          {c.exemplo || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Destino destino={c.destino} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- criar / a URL ---- */}
          {!pesquisa ? (
            <div className="space-y-2">
              <Label htmlFor="nome-webhook">Nome da pesquisa</Label>
              <Input
                id="nome-webhook"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={255}
              />
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <Link2 className="h-3 w-3" /> URL para colar na sua ferramenta
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px]">
                    {url ?? "sem permissão para ver o token"}
                  </code>
                  <Button type="button" size="sm" variant="ghost" onClick={copiar} disabled={!url}>
                    {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Gerar outro token (invalida o que já foi colado por aí)"
                    disabled={rotacionar.isPending || !pesquisa.surveyId}
                    onClick={() =>
                      rotacionar.mutate(pesquisa.surveyId, {
                        onSuccess: (r) => {
                          setCriada({ ...pesquisa, token: r.token });
                          toast.success("Token trocado — atualize a URL na ferramenta");
                        },
                      })
                    }
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Método POST. O token também vale como{" "}
                  <code className="font-mono">Authorization: Bearer</code>.
                </p>
              </div>

              <div className="text-[11px] text-muted-foreground">
                {pesquisa.recebidos > 0 ? (
                  <>
                    {pesquisa.recebidos} resposta(s) recebida(s)
                    {pesquisa.ultimoEm
                      ? ` — última em ${new Date(pesquisa.ultimoEm).toLocaleString("pt-BR")}`
                      : ""}
                    .
                  </>
                ) : (
                  "Nenhuma resposta ainda. Mande uma de teste e reabra esta janela."
                )}
              </div>

              {pesquisa.ultimas.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">O que chegou de verdade</Label>
                  <div className="overflow-x-auto rounded border border-border/40">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="px-2 py-1 font-medium">Quando</th>
                          {pesquisa.colunas.map((c) => (
                            <th key={c} className="px-2 py-1 font-mono font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pesquisa.ultimas.map((r) => (
                          <tr key={r.recebidoEm} className="border-t border-border/30">
                            <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                              {new Date(r.recebidoEm).toLocaleString("pt-BR")}
                            </td>
                            {pesquisa.colunas.map((c) => (
                              <td key={c} className="max-w-[12rem] truncate px-2 py-1">
                                {r.valores[c] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={fechar}>
            {pesquisa ? "Fechar" : "Cancelar"}
          </Button>
          {!pesquisa && (
            <Button type="button" onClick={criarFonte} disabled={criar.isPending}>
              {criar.isPending ? "Criando..." : "Criar e gerar a URL"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
