"use client";

/**
 * Subir uma pasta inteira do computador para o Swipe Files.
 *
 * ## Um arquivo por vez, de propósito
 *
 * Sessenta uploads em paralelo estouram o limite do bucket e da API de análise,
 * e o navegador não dá conta de sessenta requisições ao mesmo tempo. A fila
 * sequencial demora mais no relógio, mas termina — e mostra em qual arquivo
 * está, que é o que faz esperar dez minutos ser aceitável.
 *
 * ## A falha de um arquivo não derruba o lote
 *
 * Um `.mov` de 300 MB que estoura o limite não pode levar junto os outros 59.
 * Cada falha é anotada e a fila continua; o resumo no fim diz o que não entrou.
 */

import { useRef, useState } from "react";
import { AlertCircle, Check, FolderUp, Loader2, X } from "lucide-react";
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
import {
  useCreateSwipeFile,
  useCriarColecao,
  useMexerNaColecao,
  useUploadToBucket,
} from "@/lib/hooks/use-swipe-files";
import {
  planejarPasta,
  resumoPorTipo,
  type PlanoDaPasta,
} from "@/lib/utils/plano-da-pasta";

type Estado = "escolhendo" | "confirmando" | "subindo" | "pronto";

interface Falha {
  nome: string;
  motivo: string;
}

export function SubirPastaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>("escolhendo");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [plano, setPlano] = useState<PlanoDaPasta | null>(null);
  const [comColecoes, setComColecoes] = useState(true);
  const [feitos, setFeitos] = useState(0);
  const [atual, setAtual] = useState<string>("");
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const cancelar = useRef(false);

  const subir = useUploadToBucket();
  const criar = useCreateSwipeFile();
  const criarColecao = useCriarColecao();
  const mexerNaColecao = useMexerNaColecao();

  function recomecar() {
    setEstado("escolhendo");
    setArquivos([]);
    setPlano(null);
    setFeitos(0);
    setAtual("");
    setFalhas([]);
    cancelar.current = false;
  }

  function escolher(lista: FileList | null) {
    const fs = [...(lista ?? [])];
    if (fs.length === 0) return;
    setArquivos(fs);
    setPlano(
      planejarPasta(
        fs.map((f) => ({
          // `webkitRelativePath` é o que carrega a estrutura — sem ele, todo
          // arquivo pareceria estar na raiz.
          caminho: f.webkitRelativePath || f.name,
          nome: f.name,
          mime: f.type,
          tamanho: f.size,
        })),
        comColecoes,
      ),
    );
    setEstado("confirmando");
  }

  /** Refaz o plano quando a pessoa troca "com coleções" por "tudo solto". */
  function alternarColecoes(valor: boolean) {
    setComColecoes(valor);
    if (arquivos.length > 0) {
      setPlano(
        planejarPasta(
          arquivos.map((f) => ({
            caminho: f.webkitRelativePath || f.name,
            nome: f.name,
            mime: f.type,
            tamanho: f.size,
          })),
          valor,
        ),
      );
    }
  }

  async function executar() {
    if (!plano) return;
    setEstado("subindo");
    cancelar.current = false;
    const erros: Falha[] = [];

    /**
     * As coleções vêm ANTES dos arquivos, e das rasas para as fundas.
     *
     * A filha precisa do id da mãe para nascer no lugar certo — criar tudo em
     * paralelo daria uma árvore plana com nomes repetidos.
     */
    const idPorCaminho = new Map<string, string>();
    for (const c of plano.colecoes) {
      if (cancelar.current) break;
      const caminhoPai = c.caminho.slice(0, -1).join("/");
      try {
        const criada = await criarColecao.mutateAsync({
          nome: c.nome,
          parentId: caminhoPai ? (idPorCaminho.get(caminhoPai) ?? null) : null,
        });
        idPorCaminho.set(c.caminho.join("/"), criada.id);
      } catch {
        erros.push({ nome: c.nome, motivo: "não consegui criar a coleção" });
      }
    }

    for (const item of plano.itens) {
      if (cancelar.current) break;
      setAtual(item.nome);
      const file = arquivos.find((f) => (f.webkitRelativePath || f.name) === item.caminho);
      if (!file) {
        erros.push({ nome: item.nome, motivo: "arquivo não encontrado" });
        setFeitos((n) => n + 1);
        continue;
      }

      try {
        const { publicUrl, key } = await subir.mutateAsync({ file });
        const criado = await criar.mutateAsync({
          // O nome do arquivo é o título; a IA não roda aqui — analisar 60
          // arquivos levaria vinte minutos, e a catalogação pode ser feita
          // depois, item a item ou pelo backfill.
          title: item.nome.replace(/\.[^.]+$/, "").slice(0, 200),
          assetKind: item.mimeFinal.startsWith("image/")
            ? "image"
            : item.mimeFinal.startsWith("video/")
              ? "video"
              : item.mimeFinal === "application/pdf"
                ? "pdf"
                : "html",
          fileUrl: publicUrl,
          fileKey: key,
          fileMime: item.mimeFinal,
          fileSizeBytes: item.tamanho,
          tags: [],
        });

        const idColecao = item.colecao.length
          ? idPorCaminho.get(item.colecao.join("/"))
          : undefined;
        if (idColecao) {
          await mexerNaColecao.mutateAsync({ id: idColecao, adicionar: [criado.id] });
        }
      } catch (e) {
        erros.push({
          nome: item.nome,
          motivo: e instanceof Error ? e.message : "falhou ao subir",
        });
      }
      setFeitos((n) => n + 1);
    }

    setFalhas(erros);
    setEstado("pronto");
    const ok = plano.itens.length - erros.length;
    if (ok > 0) toast.success(`${ok} ${ok === 1 ? "referência subiu" : "referências subiram"}`);
  }

  const total = plano?.itens.length ?? 0;
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Fechar no meio da fila cancela o resto — sem isso a subida continua
        // invisível e a pessoa não sabe se pode sair da página.
        if (!v && estado === "subindo") cancelar.current = true;
        if (!v) recomecar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir uma pasta</DialogTitle>
          <DialogDescription>
            Escolha uma pasta do computador. As subpastas viram coleções dentro dela, na mesma
            estrutura — ou tudo entra solto, se preferir.
          </DialogDescription>
        </DialogHeader>

        {estado === "escolhendo" && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center transition-colors hover:border-foreground/30 hover:bg-muted/30">
            <FolderUp className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">Escolher pasta</span>
            <span className="max-w-xs text-[12px] text-muted-foreground">
              Imagem, vídeo, PDF e página. O que não for referência fica de fora, e a tela diz o
              quê.
            </span>
            <input
              type="file"
              // `webkitdirectory` é o atributo que abre o seletor de PASTA. Só
              // funciona escrito assim, e o React exige o cast.
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              multiple
              onChange={(e) => escolher(e.target.files)}
              className="sr-only"
            />
          </label>
        )}

        {estado === "confirmando" && plano && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">{plano.raiz ?? "Pasta"}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {plano.itens.length} {plano.itens.length === 1 ? "arquivo" : "arquivos"} ·{" "}
                {(plano.bytes / 1024 / 1024).toFixed(1)} MB
                {plano.colecoes.length > 0 &&
                  ` · ${plano.colecoes.length} ${plano.colecoes.length === 1 ? "coleção" : "coleções"}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resumoPorTipo(plano.itens).map((t) => (
                  <span
                    key={t.tipo}
                    className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {t.n} {t.tipo}
                    {t.n > 1 && t.tipo !== "PDF" ? "s" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  valor: true,
                  titulo: "Seguir a estrutura de pastas",
                  ajuda: "Cada pasta vira uma coleção, aninhada como no computador.",
                },
                {
                  valor: false,
                  titulo: "Subir tudo solto",
                  ajuda: "Os arquivos entram na biblioteca sem criar coleção nenhuma.",
                },
              ].map((op) => (
                <button
                  key={String(op.valor)}
                  type="button"
                  onClick={() => alternarColecoes(op.valor)}
                  className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                    comColecoes === op.valor
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                      comColecoes === op.valor ? "border-primary" : "border-border"
                    }`}
                  >
                    {comColecoes === op.valor && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{op.titulo}</span>
                    <span className="block text-[11px] text-muted-foreground">{op.ajuda}</span>
                  </span>
                </button>
              ))}
            </div>

            {comColecoes && plano.colecoes.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border/50 p-2">
                {plano.colecoes.map((c) => (
                  <p
                    key={c.caminho.join("/")}
                    className="truncate text-[11px] text-muted-foreground"
                    style={{ paddingLeft: (c.caminho.length - 1) * 12 }}
                  >
                    {c.caminho.length > 1 && "└ "}
                    {c.nome}
                  </p>
                ))}
              </div>
            )}

            {plano.ignorados.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {plano.ignorados.length}{" "}
                  {plano.ignorados.length === 1 ? "arquivo fica" : "arquivos ficam"} de fora
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                  {plano.ignorados
                    .slice(0, 6)
                    .map((i) => i.nome)
                    .join(", ")}
                  {plano.ignorados.length > 6 && ` e mais ${plano.ignorados.length - 6}`}
                </p>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Os arquivos sobem um por vez e a IA <strong>não</strong> cataloga agora — analisar
              dezenas levaria muitos minutos. Dá para catalogar depois, item a item.
            </p>
          </div>
        )}

        {estado === "subindo" && (
          <div className="space-y-3 py-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {feitos} de {total} · {atual}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Pode deixar aberto. Fechar cancela o que ainda não subiu — o que já entrou fica.
            </p>
          </div>
        )}

        {estado === "pronto" && plano && (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check className="h-4 w-4 text-emerald-500" />
              {plano.itens.length - falhas.length} de {plano.itens.length} no lugar
            </p>
            {falhas.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                {falhas.map((f, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-[11px]">
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                    <span className="min-w-0">
                      <span className="font-medium">{f.nome}</span>
                      <span className="text-muted-foreground"> — {f.motivo}</span>
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {estado === "confirmando" && (
            <>
              <Button variant="ghost" size="sm" onClick={recomecar}>
                Trocar de pasta
              </Button>
              <Button size="sm" onClick={() => void executar()} disabled={total === 0}>
                Subir {total} {total === 1 ? "arquivo" : "arquivos"}
              </Button>
            </>
          )}
          {estado === "subindo" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                cancelar.current = true;
              }}
            >
              Parar depois deste
            </Button>
          )}
          {estado === "pronto" && (
            <>
              <Button variant="ghost" size="sm" onClick={recomecar}>
                Subir outra pasta
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
