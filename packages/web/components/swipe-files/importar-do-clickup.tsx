"use client";

/**
 * Trazer para a biblioteca o acervo que ficou no chat do ClickUp.
 *
 * ## Por que a simulação vem antes
 *
 * Importar cria centenas de registros de uma vez, e a única forma de perceber
 * que o canal escolhido é o errado é ver o número antes. Então o primeiro botão
 * não grava nada: lê o canal, planeja e diz quantos itens sairiam dali — e
 * quantos já entraram numa rodada anterior. Só depois aparece o botão que grava.
 *
 * ## O progresso é item a item
 *
 * São centenas de arquivos e centenas de megabytes; leva minutos. Uma barra que
 * anda sem dizer o quê não distingue "trabalhando" de "travado". Cada linha que
 * aparece aqui é um arquivo que entrou — e as que falharam ficam visíveis, com
 * o motivo, em vez de sumirem numa contagem final.
 */

import { useEffect, useRef, useState } from "react";
import { FileType, Code2,
  AlertCircle,
  Check,
  Download,
  FileText,
  Film,
  ImageIcon,
  Link2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useCanaisDoClickUp,
  useImportarDoClickUp,
  type PassoDaImportacao,
} from "@/lib/hooks/use-swipe-files";

interface Plano {
  mensagens: number;
  total: number;
  jaImportados: number;
  pendentes: number;
  aImportar: number;
  comArquivo: number;
}

/**
 * Itens por pedido HTTP.
 *
 * Vinte e cinco arquivos com analise levam poucos minutos -- folgado dentro do
 * prazo, e pequeno o bastante para que uma queda custe pouco. Cada lote que
 * termina esta gravado.
 */
const TAMANHO_DO_LOTE = 25;

interface Linha {
  titulo: string;
  kind: "image" | "video" | "pdf" | "link" | "html" | "doc";
  ok: boolean;
  erro?: string;
}

const ICONE = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  link: Link2,
  html: Code2,
  doc: FileType,
} as const;

export function ImportarDoClickUp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: canais, isLoading: carregandoCanais } = useCanaisDoClickUp(open);
  const importar = useImportarDoClickUp();

  const [canal, setCanal] = useState("");
  const [analisar, setAnalisar] = useState(true);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [lendo, setLendo] = useState(false);

  const fimDaLista = useRef<HTMLDivElement>(null);

  // A lista cresce por baixo; sem isto o item que está entrando agora fica
  // fora da vista justamente enquanto se olha para ela.
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "nearest" });
  }, [linhas.length]);

  // Trocar de canal invalida o que foi planejado para o anterior — deixar o
  // número antigo na tela ao lado do canal novo é o caminho para importar o
  // canal errado com confiança.
  useEffect(() => {
    setPlano(null);
    setLinhas([]);
  }, [canal]);

  function receber(p: PassoDaImportacao) {
    if (p.tipo === "lendo-canal") setLendo(true);
    if (p.tipo === "plano") {
      setLendo(false);
      setPlano(p);
    }
    if (p.tipo === "item") {
      setLinhas((v) => [
        ...v,
        { titulo: p.titulo, kind: p.kind, ok: p.status === "ok", erro: p.erro },
      ]);
    }
  }

  async function simular() {
    setLinhas([]);
    try {
      await importar.mutateAsync({ channelId: canal, onPasso: receber });
    } catch (e) {
      setLendo(false);
      toast.error(e instanceof Error ? e.message : "Não consegui ler o canal");
    }
  }

  /**
   * Importa em lotes, um pedido HTTP por lote.
   *
   * Medido: 246 arquivos para o bucket e 213 análises de imagem dão perto de
   * uma hora. Nenhum proxy mantém um POST aberto por tanto tempo — e um único
   * pedido que estoura leva junto tudo que ainda não tinha sido gravado.
   *
   * Em lotes, cada pedido cabe folgado no prazo e o que entrou está gravado.
   * A chave de importação faz o resto: o lote seguinte recomeça exatamente de
   * onde o anterior parou, sem repetir nada.
   */
  async function executar() {
    setLinhas([]);

    let criados = 0;
    let falhas = 0;

    try {
      for (let lote = 0; lote < 60; lote++) {
        const r = await importar.mutateAsync({
          channelId: canal,
          confirmar: true,
          analisar,
          limite: TAMANHO_DO_LOTE,
          onPasso: (p) => {
            // O `plano` de cada lote recontaria o total e a barra voltaria ao
            // começo a cada rodada. Só o primeiro define o alvo.
            if (p.tipo === "plano" && lote > 0) return;
            receber(p);
          },
        });
        criados += r.criados;
        falhas += r.falhas;

        // Nada criado neste lote: ou acabou, ou todos os itens restantes estão
        // falhando. Nos dois casos, insistir só repetiria o mesmo erro.
        if (r.criados === 0) break;
      }

      toast.success(
        `${criados} referência(s) na biblioteca`,
        falhas > 0 ? { description: `${falhas} não entraram — o motivo está na lista.` } : undefined,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "A importação parou",
        criados > 0
          ? { description: `${criados} já entraram. Rodar de novo continua de onde parou.` }
          : undefined,
      );
    }
  }

  const ocupado = importar.isPending;
  const nomeDoCanal = canais?.channels.find((c) => c.id === canal)?.name;

  return (
    <Dialog open={open} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">Importar do ClickUp</DialogTitle>
          <DialogDescription>
            Lê um canal de chat e traz os anexos e links como referências. O que já foi importado
            antes não entra de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="canal" className="text-[11px] font-medium">
              Canal
            </Label>
            <select
              id="canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              disabled={ocupado || carregandoCanais}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">
                {carregandoCanais ? "Carregando canais…" : "Escolha o canal…"}
              </option>
              {canais?.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3">
            <input
              type="checkbox"
              checked={analisar}
              onChange={(e) => setAnalisar(e.target.checked)}
              disabled={ocupado}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12px] font-medium">
                <Sparkles className="h-3 w-3 text-primary" />
                Catalogar com IA
              </span>
              {/* Sem marca, nicho e formato a biblioteca vira uma pasta: existe,
                  mas ninguém acha nada. Dito aqui porque o custo é de tempo. */}
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                Preenche marca, nicho, formato e tags de cada imagem e PDF. Sem isso os itens
                entram sem faceta nenhuma — e é a faceta que faz achar depois. Deixa a importação
                bem mais lenta.
              </span>
            </span>
          </label>

          {plano && (
            <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-[12px]">
              <p className="font-medium">
                {nomeDoCanal ? `${nomeDoCanal}: ` : ""}
                {plano.mensagens} mensagens lidas
              </p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">{plano.pendentes}</strong> item(ns) a importar —{" "}
                {plano.comArquivo} com arquivo para subir.
              </p>
              {plano.jaImportados > 0 && (
                <p className="text-muted-foreground">
                  {plano.jaImportados} já estavam na biblioteca e ficam de fora.
                </p>
              )}
            </div>
          )}

          {lendo && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Lendo o canal e as threads…
            </p>
          )}

          {linhas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium">
                {/* Conta as linhas, e nao o item do lote: em lotes de 25, o
                    contador do servidor voltaria a 1 a cada rodada. */}
                {importar.isPending && plano
                  ? `${linhas.length} de ${plano.pendentes}`
                  : "Resultado"}
              </p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
                {linhas.map((l, i) => {
                  const Icone = ICONE[l.kind];
                  return (
                    <div key={i} className="flex items-start gap-1.5 px-1 py-0.5 text-[11px]">
                      {l.ok ? (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                      )}
                      <Icone className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className={l.ok ? "" : "text-muted-foreground line-through"}>
                          {l.titulo}
                        </span>
                        {l.erro && <span className="block text-destructive">{l.erro}</span>}
                      </span>
                    </div>
                  );
                })}
                <div ref={fimDaLista} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={ocupado}
          >
            Fechar
          </Button>

          {/* O botão que grava só aparece depois de existir um número para
              olhar: é a diferença entre confirmar e descobrir. */}
          {!plano ? (
            <Button size="sm" onClick={simular} disabled={!canal || ocupado}>
              {ocupado ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Ver o que tem lá
            </Button>
          ) : (
            <Button size="sm" onClick={executar} disabled={ocupado || plano.pendentes === 0}>
              {ocupado ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Importar {plano.pendentes}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
