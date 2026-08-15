"use client";

/**
 * Sobe um comprovante de pagamento (print ou PDF), a IA lê e devolve os campos
 * da venda de ingresso. A pessoa confere e confirma.
 *
 * O passo de conferência é o ponto: leitura de imagem erra — troca pagador por
 * recebedor, lê taxa no lugar do total. Mostrar o que foi lido ANTES de abrir o
 * formulário custa um clique e evita venda errada entrando na base sem ninguém
 * ver. Campo que a IA não conseguiu ler aparece destacado, não escondido.
 */

import { useRef, useState } from "react";
import { FileUp, Loader2, ScanLine, AlertTriangle, Check } from "lucide-react";
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
  useExtrairComprovante,
  MIMES_ACEITOS,
  type DadosComprovante,
} from "@/lib/hooks/use-receipt-extract";

const TAMANHO_MAX_MB = 10;

const ROTULOS: Record<string, string> = {
  customerName: "Nome do pagador",
  value: "Valor",
  saleDate: "Data",
  paymentMethod: "Forma de pagamento",
  customerCpf: "CPF",
  customerPhone: "Telefone",
};

function fmtValor(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function fmtDoc(v: string | null): string {
  if (!v) return "—";
  if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (v.length === 14) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

function fmtTelefone(v: string | null): string {
  if (!v) return "—";
  if (v.length === 11) return v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (v.length === 10) return v.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v;
}

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe os dados confirmados pra abrir o formulário já preenchido. */
  onConfirmar: (dados: DadosComprovante) => void;
}

export function ReceiptUploadDialog({
  projectId,
  funnelId,
  stageId,
  open,
  onOpenChange,
  onConfirmar,
}: Props) {
  const extrair = useExtrairComprovante(projectId, funnelId, stageId);
  const [dados, setDados] = useState<DadosComprovante | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDados(null);
    setNomeArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function fechar() {
    reset();
    onOpenChange(false);
  }

  async function handleArquivo(arquivo: File | undefined) {
    if (!arquivo) return;

    if (!MIMES_ACEITOS.includes(arquivo.type)) {
      toast.error("Envie um print (PNG, JPG, WEBP) ou um PDF");
      return;
    }
    if (arquivo.size > TAMANHO_MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo maior que ${TAMANHO_MAX_MB}MB`);
      return;
    }

    setNomeArquivo(arquivo.name);
    try {
      const lidos = await extrair.mutateAsync(arquivo);
      setDados(lidos);
      if (lidos.camposNaoEncontrados.length > 0) {
        toast.warning("Li o comprovante, mas alguns campos ficaram em branco");
      } else {
        toast.success("Comprovante lido");
      }
    } catch (e) {
      setNomeArquivo(null);
      toast.error(e instanceof Error ? e.message : "Não consegui ler o comprovante");
    }
  }

  const naoEncontrados = new Set(dados?.camposNaoEncontrados ?? []);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : fechar())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Ler comprovante
          </DialogTitle>
          <DialogDescription>
            Suba o print ou o PDF do pagamento. Eu preencho a venda e você confere antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {!dados ? (
          <div className="flex min-w-0 flex-col gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={extrair.isPending}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 p-8 transition-colors hover:bg-muted/30 disabled:opacity-60"
            >
              {extrair.isPending ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <span className="text-sm font-medium">Lendo {nomeArquivo}…</span>
                  <span className="text-xs text-muted-foreground">Leva alguns segundos</span>
                </>
              ) : (
                <>
                  <FileUp className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-medium">Escolher arquivo</span>
                  <span className="text-xs text-muted-foreground">
                    Print (PNG, JPG, WEBP) ou PDF · até {TAMANHO_MAX_MB}MB
                  </span>
                </>
              )}
            </button>

            <input
              ref={inputRef}
              type="file"
              accept={MIMES_ACEITOS.join(",")}
              className="hidden"
              onChange={(e) => handleArquivo(e.target.files?.[0])}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-lg border border-border/50 divide-y divide-border/40">
              <Linha rotulo="Nome do pagador" valor={dados.customerName ?? "—"} faltando={naoEncontrados.has("customerName")} />
              <Linha rotulo="Valor" valor={fmtValor(dados.value)} faltando={naoEncontrados.has("value")} destaque />
              <Linha rotulo="Data" valor={fmtData(dados.saleDate)} faltando={naoEncontrados.has("saleDate")} />
              <Linha rotulo="Forma de pagamento" valor={dados.paymentMethod ?? "—"} faltando={naoEncontrados.has("paymentMethod")} />
              <Linha rotulo="CPF" valor={fmtDoc(dados.customerCpf)} faltando={naoEncontrados.has("customerCpf")} />
              <Linha rotulo="Telefone" valor={fmtTelefone(dados.customerPhone)} faltando={naoEncontrados.has("customerPhone")} />
            </div>

            {naoEncontrados.size > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-muted-foreground">
                  Não consegui ler:{" "}
                  <strong>
                    {[...naoEncontrados].map((c) => ROTULOS[c] ?? c).join(", ")}
                  </strong>
                  . Você completa no formulário.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Confira os dados — principalmente o <strong>nome</strong> (tem que ser quem pagou) e o{" "}
              <strong>valor</strong>.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                Trocar arquivo
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  onConfirmar(dados);
                  fechar();
                }}
              >
                <Check className="h-4 w-4" />
                Usar estes dados
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  rotulo,
  valor,
  faltando,
  destaque,
}: {
  rotulo: string;
  valor: string;
  faltando: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <span
        className={`min-w-0 truncate text-right text-sm ${
          faltando
            ? "text-amber-600 dark:text-amber-400"
            : destaque
              ? "font-semibold"
              : "font-medium"
        }`}
      >
        {faltando ? "não encontrado" : valor}
      </span>
    </div>
  );
}
