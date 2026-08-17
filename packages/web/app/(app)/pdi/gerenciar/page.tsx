"use client";

/**
 * Gestão de PDIs — admin only.
 *
 * Sobe o HTML (arquivo ou colado), escolhe a pessoa e atribui. Cada atribuição
 * é uma versão: a pessoa vê a mais recente e o histórico fica listado aqui.
 *
 * A pré-visualização usa o MESMO viewer que a pessoa vê — conferir num render
 * diferente do real não confere nada.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, Loader2, Target, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PdiViewer } from "@/components/pdi/pdi-viewer";
import {
  useAtribuirPdi,
  usePdiLista,
  usePdiUsuariosAtribuiveis,
  useRemoverPdi,
} from "@/lib/hooks/use-pdi";
import { useUserRole } from "@/lib/hooks/use-user-role";

const TAMANHO_MAX_MB = 2;

export default function GerenciarPdiPage() {
  const role = useUserRole();
  const { data: lista, isLoading: carregandoLista } = usePdiLista(role === "admin");
  const { data: usuarios } = usePdiUsuariosAtribuiveis(role === "admin");
  const atribuir = useAtribuirPdi();
  const remover = useRemoverPdi();

  const [userId, setUserId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [html, setHtml] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Guard de UI. O backend é quem barra de verdade (403 em toda rota de gestão);
  // isto só evita mostrar uma tela que não vai funcionar.
  if (role !== null && role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Área restrita a administradores.</p>
      </div>
    );
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!/\.html?$/i.test(arquivo.name) && arquivo.type !== "text/html") {
      toast.error("Envie um arquivo .html");
      return;
    }
    if (arquivo.size > TAMANHO_MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo maior que ${TAMANHO_MAX_MB}MB`);
      return;
    }
    const conteudo = await arquivo.text();
    setHtml(conteudo);
    setNomeArquivo(arquivo.name);
    // Nome do arquivo como título é o palpite certo na maioria das vezes —
    // "PDI - Lucas Vital.html" vira "PDI - Lucas Vital".
    if (!titulo.trim()) setTitulo(arquivo.name.replace(/\.html?$/i, ""));
  }

  function limpar() {
    setUserId("");
    setTitulo("");
    setHtml("");
    setNomeArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function salvar() {
    if (!userId) return toast.error("Escolha para quem é o PDI");
    if (!titulo.trim()) return toast.error("Dê um título ao PDI");
    if (html.trim().length < 20) return toast.error("Cole ou envie o HTML do PDI");

    atribuir.mutate(
      { userId, title: titulo.trim(), html },
      {
        onSuccess: () => {
          toast.success("PDI atribuído");
          limpar();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atribuir"),
      },
    );
  }

  const documentos = lista?.documentos ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="h-6 w-6 text-primary" />
            Gerenciar PDIs
          </h1>
          <p className="text-sm text-muted-foreground">
            Suba o HTML do PDI e atribua a uma pessoa. Cada atribuição vira uma versão nova — a
            pessoa vê a mais recente.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/pdi">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao meu PDI
          </Link>
        </Button>
      </div>

      {/* Formulário */}
      <div className="space-y-4 rounded-xl border border-border/40 bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pdi-user">Para quem</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="pdi-user">
                <SelectValue placeholder="Selecione a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {(usuarios?.usuarios ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdi-title">Título</Label>
            <Input
              id="pdi-title"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: PDI — 2º semestre"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Documento HTML</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
              <FileUp className="h-3.5 w-3.5" />
              Escolher arquivo .html
            </Button>
            {nomeArquivo && (
              <span className="text-xs text-muted-foreground">{nomeArquivo}</span>
            )}
            {html && (
              <span className="text-xs text-muted-foreground">
                · {(new Blob([html]).size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".html,text/html"
            className="hidden"
            onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
          />
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="…ou cole o HTML aqui"
            className="min-h-[120px] font-mono text-xs"
          />
        </div>

        {/* Pré-visualização no mesmo viewer que a pessoa vê. */}
        {html.trim().length > 20 && (
          <div className="space-y-1.5">
            <Label>Pré-visualização</Label>
            <PdiViewer html={html} titulo={titulo || "Pré-visualização do PDI"} />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={limpar} disabled={atribuir.isPending}>
            Limpar
          </Button>
          <Button onClick={salvar} disabled={atribuir.isPending} className="gap-1.5">
            {atribuir.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Atribuir PDI
          </Button>
        </div>
      </div>

      {/* Histórico */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">PDIs atribuídos</h2>
        {carregandoLista ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : documentos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum PDI atribuído ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pessoa</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Título</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Atribuído</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {documentos.map((d, i) => {
                  // O primeiro de cada pessoa é o vigente (a lista vem desc por data).
                  const ehVigente = documentos.findIndex((x) => x.userId === d.userId) === i;
                  return (
                    <tr key={d.id} className="border-t border-border/10">
                      <td className="max-w-[200px] truncate px-3 py-2">
                        {d.userName || d.userEmail}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2">
                        {d.title}
                        {ehVigente ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            vigente
                          </span>
                        ) : (
                          <span className="ml-2 text-[10px] text-muted-foreground">versão anterior</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setConfirmarRemocao(d.id)}
                          aria-label="Remover PDI"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!confirmarRemocao}
        onOpenChange={(o) => !o && setConfirmarRemocao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este PDI?</AlertDialogTitle>
            <AlertDialogDescription>
              Se for a versão vigente, a pessoa passa a ver a anterior — ou nenhuma, se não houver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmarRemocao) return;
                remover.mutate(confirmarRemocao, {
                  onSuccess: () => toast.success("PDI removido"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
                });
                setConfirmarRemocao(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
