"use client";

/**
 * Story 47.9 — "Nova VSL": expert → produto → lead → problema → solução →
 * oferta, prévia ao vivo, "+ cadastrar nova" nas variáveis e na oferta,
 * Salvar, "Salvar e criar outra" (mantém expert e produto). Também serve para
 * Editar e Duplicar (`?editar=` / `?duplicar=` na aba `nova`).
 *
 * Pedido do dono (2026-09-10): ao escolher o expert, listar abaixo as VSLs já
 * criadas dele (mesmo desenho da lista de LPs no Slug de LP, 47.7); escolher
 * o produto estreita a lista.
 *
 * As decisões (cascata, prévia, corpo da API) estão em
 * `lib/utils/nomenclatura-vsl.ts`, com teste. Aqui só se desenha.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { erroDaApi, useCriarVsl, useEditarVsl, useListaDe, useVsl, useVsls, type ErroDaApi, type VariavelDeVsl } from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import {
  CLASSE_DO_BLOCO_DA_VSL,
  ESTADO_VAZIO_DA_VSL,
  LEGENDA_DA_VSL,
  ROTULO_DA_VARIAVEL,
  TIPOS_DE_VARIAVEL,
  aoEscolherNaVsl,
  camposDaVsl,
  corpoDaVsl,
  estadoDeVsl,
  linkDaVslValido,
  previaDaVsl,
  type EstadoDaVsl,
  type PreviaDaVsl,
  type TipoDeVariavel,
} from "@/lib/utils/nomenclatura-vsl";
import { FormFunilOuOferta } from "../forms";
import { copiarTexto } from "../previa-do-nome";
import { SeletorDeExpert } from "../seletor-de-expert";
import { FormVariavel } from "./form-variavel";

type Modo = { tipo: "nova" } | { tipo: "editar"; id: string } | { tipo: "duplicar"; id: string };

const CAMPO_DA_VARIAVEL: Record<TipoDeVariavel, "leadId" | "problemId" | "solutionId"> = { lead: "leadId", problem: "problemId", solution: "solutionId" };

function SelectDaVsl(props: { id: string; label: string; valor: string; onChange: (v: string) => void; opcoes: { value: string; rotulo: string }[]; desabilitado?: boolean; placeholder?: string; vazio?: string; aoCadastrar?: () => void }) {
  const { id, label, valor, onChange, opcoes, desabilitado, placeholder, vazio, aoCadastrar } = props;
  const semOpcoes = !desabilitado && opcoes.length === 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {aoCadastrar ? (
          <button type="button" onClick={aoCadastrar} className="text-xs text-muted-foreground underline-offset-2 hover:underline" disabled={desabilitado}>
            <Plus className="mr-0.5 inline h-3 w-3" />
            cadastrar nova
          </button>
        ) : null}
      </div>
      <Select value={valor} onValueChange={onChange} disabled={desabilitado || semOpcoes}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={semOpcoes ? vazio : (placeholder ?? "Escolha")} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* AC10: vazio declarado, não select mudo. */}
      {semOpcoes && vazio ? <p className="text-xs text-warning">{vazio}</p> : null}
    </div>
  );
}

function PreviaDaVslView({ previa }: { previa: PreviaDaVsl }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGENDA_DA_VSL.map((l) => (
          <span key={l.bloco} title={l.descricao}>
            <span className={cn("font-semibold", CLASSE_DO_BLOCO_DA_VSL[l.bloco])}>■</span> {l.rotulo}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-base" aria-label="prévia do nome da VSL">
          {previa.pedacos.map((p, i) => (
            <span key={p.campo}>
              {i > 0 ? <span className="text-muted-foreground">_</span> : null}
              <span className={p.faltando ? "text-muted-foreground" : CLASSE_DO_BLOCO_DA_VSL[p.bloco]} title={p.campo}>
                {p.faltando ? "…" : p.valor}
              </span>
            </span>
          ))}
        </code>
        <Button type="button" variant="outline" size="sm" disabled={!previa.nome} onClick={() => previa.nome && void copiarTexto(previa.nome)}>
          <Copy className="mr-1 h-4 w-4" /> Copiar nome
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {previa.nome ? `${previa.tamanho} caracteres` : previa.erro ? <span className="text-destructive">{previa.erro}</span> : "Preencha os campos para liberar o nome."}
      </p>
    </div>
  );
}

export function GeradorDeVsl({ modo }: { modo: Modo }) {
  const router = useRouter();
  const idDaOrigem = modo.tipo === "nova" ? null : modo.id;
  const origem = useVsl(idDaOrigem);
  const [estado, setEstado] = useState<EstadoDaVsl>(ESTADO_VAZIO_DA_VSL);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [cadastro, setCadastro] = useState<TipoDeVariavel | "oferta" | null>(null);
  const criar = useCriarVsl();
  const editar = useEditarVsl();

  // Listas: só ATIVOS (regra 8).
  const experts = useListaDe("experts");
  const produtos = useListaDe("produtos", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const ofertas = useListaDe("ofertas", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const variaveis = useListaDe("vsl/variaveis", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  // VSLs já criadas do expert (estreita pelo produto quando escolhido).
  const existentes = useVsls({ expertId: estado.expertId || undefined, productId: estado.productId || undefined, limit: 100 });
  const temExpert = Boolean(estado.expertId);

  // Pré-preenchimento UMA vez por id (mesma guarda do gerador de campanha).
  const carregadoDe = useRef<string | null>(null);
  useEffect(() => {
    if (origem.data && carregadoDe.current !== origem.data.id) {
      carregadoDe.current = origem.data.id;
      setEstado(estadoDeVsl(origem.data));
    }
  }, [origem.data]);

  const previa = useMemo(
    () =>
      previaDaVsl(
        camposDaVsl(estado, {
          experts: experts.data ?? [],
          produtos: produtos.data ?? [],
          variaveis: (variaveis.data ?? []).map((v: VariavelDeVsl) => ({ id: v.id, type: v.type, code: v.code })),
          ofertas: ofertas.data ?? [],
        }),
      ),
    [estado, experts.data, produtos.data, variaveis.data, ofertas.data],
  );

  const escolher = (campo: keyof EstadoDaVsl) => (v: string) => setEstado((e) => aoEscolherNaVsl(e, campo, v));
  const expertCode = experts.data?.find((e) => e.id === estado.expertId)?.code ?? "este expert";
  const opcoesDe = (tipo: TipoDeVariavel) => (variaveis.data ?? []).filter((v) => v.type === tipo).map((v) => ({ value: v.id, rotulo: v.rotulo }));

  async function salvar(eOutra = false) {
    setErro(null);
    try {
      const corpo = corpoDaVsl(estado);
      const salva = modo.tipo === "editar" ? await editar.mutateAsync({ id: modo.id, dados: corpo }) : await criar.mutateAsync(corpo);
      await navigator.clipboard.writeText(salva.name).catch(() => undefined);
      if (eOutra) {
        // Mantém expert e produto (AC8); limpa as três variáveis, a oferta e as observações.
        toast.success(<span>Salva e nome copiado: <code className="font-mono">{salva.name}</code>. Escolha o próximo ângulo.</span>, { duration: 8000 });
        setEstado((e) => ({ ...e, leadId: "", problemId: "", solutionId: "", offerId: "", url: "", notes: "" }));
        return;
      }
      toast.success(<span>VSL salva e nome copiado: <code className="font-mono">{salva.name}</code></span>, {
        duration: 8000,
        action: { label: "Criar outra", onClick: () => router.push(hrefDe("vsl", "nova")) },
      });
      router.push(hrefDe("vsl", "lista"));
    } catch (e) {
      setErro(erroDaApi(e));
    }
  }

  const salvando = criar.isPending || editar.isPending;
  if (idDaOrigem && origem.isLoading) return <p className="text-sm text-muted-foreground">Carregando VSL…</p>;
  if (idDaOrigem && origem.error) return <p className="text-sm text-destructive">{erroDaApi(origem.error).mensagem}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <div className="space-y-4">
        {modo.tipo !== "nova" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>
              {modo.tipo === "editar" ? "Editando" : "Duplicando"} <code className="font-mono">{origem.data?.name}</code>
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={hrefDe("vsl", "nova")}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Começar uma nova</Link>
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3">
          <div>
            <SeletorDeExpert valor={estado.expertId} onChange={escolher("expertId")} id="v-expert" />
            {!estado.expertId ? <p className="mt-1 text-xs text-muted-foreground">Comece pelo expert — produto, variáveis e oferta liberam em cascata.</p> : null}
          </div>
          <SelectDaVsl id="v-produto" label="Produto" valor={estado.productId} onChange={escolher("productId")} opcoes={(produtos.data ?? []).map((p) => ({ value: p.id, rotulo: `${p.slug} — ${p.name}` }))} desabilitado={!estado.expertId} vazio={`nenhum produto cadastrado para ${expertCode} — cadastre em Dicionário › Produtos`} />
          {TIPOS_DE_VARIAVEL.map((tipo) => (
            <SelectDaVsl
              key={tipo}
              id={`v-${tipo}`}
              label={ROTULO_DA_VARIAVEL[tipo]}
              valor={estado[CAMPO_DA_VARIAVEL[tipo]]}
              onChange={escolher(CAMPO_DA_VARIAVEL[tipo])}
              opcoes={opcoesDe(tipo)}
              desabilitado={!estado.expertId}
              vazio={`nenhum ${ROTULO_DA_VARIAVEL[tipo].toLowerCase()} cadastrado para ${expertCode} — cadastre em Dicionário › Variáveis de VSL`}
              aoCadastrar={() => setCadastro(tipo)}
            />
          ))}
          <SelectDaVsl id="v-oferta" label="Oferta (pitch)" valor={estado.offerId} onChange={escolher("offerId")} opcoes={(ofertas.data ?? []).map((o) => ({ value: o.id, rotulo: o.rotulo }))} desabilitado={!estado.expertId} vazio={`nenhuma oferta cadastrada para ${expertCode} — cadastre em Dicionário › Ofertas`} aoCadastrar={() => setCadastro("oferta")} />
        </div>

        {temExpert ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              VSLs de <span className="font-mono">{expertCode}</span>
              {estado.productId ? <span className="font-normal text-muted-foreground"> · {produtos.data?.find((p) => p.id === estado.productId)?.slug ?? ""}</span> : null}
            </h3>
            {existentes.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : existentes.error ? (
              <p className="text-sm text-destructive" role="alert">Não foi possível listar as VSLs: {erroDaApi(existentes.error).mensagem}</p>
            ) : (existentes.data?.itens.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{estado.productId ? "Nenhuma VSL deste produto ainda." : `Nenhuma VSL de ${expertCode} ainda.`}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Problema</TableHead>
                      <TableHead>Solução</TableHead>
                      <TableHead>Oferta</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existentes.data!.itens.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <code className="font-mono text-sm">{v.name}</code>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar nome" aria-label={`Copiar ${v.name}`} onClick={() => void copiarTexto(v.name)}><Copy className="h-3.5 w-3.5" /></Button>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{v.productSlug}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={v.leadRotulo}>{v.leadRotulo}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={v.problemRotulo}>{v.problemRotulo}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={v.solutionRotulo}>{v.solutionRotulo}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={v.offerRotulo}>{v.offerRotulo}</TableCell>
                        <TableCell>{v.url ? <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2"><ExternalLink className="h-3.5 w-3.5" />abrir</a> : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="v-url">Link da VSL no Drive (opcional)</Label>
          <Input id="v-url" value={estado.url} onChange={(e) => setEstado((s) => ({ ...s, url: e.target.value }))} placeholder="https://drive.google.com/…" aria-invalid={!linkDaVslValido(estado.url) || undefined} />
          {!linkDaVslValido(estado.url) ? <p className="text-xs text-destructive">Cole o link completo, começando com https://</p> : <p className="text-xs text-muted-foreground">O vídeo ou o roteiro no Drive. Fica na listagem como link.</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-notas">Observações (opcional)</Label>
          <Textarea id="v-notas" value={estado.notes} onChange={(e) => setEstado((s) => ({ ...s, notes: e.target.value }))} rows={2} />
        </div>

        {erro ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro.mensagem}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void salvar()} disabled={!previa.completo || !linkDaVslValido(estado.url) || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {modo.tipo === "editar" ? "Salvar alterações" : "Salvar"}
          </Button>
          {modo.tipo !== "editar" ? (
            <Button type="button" variant="secondary" onClick={() => void salvar(true)} disabled={!previa.completo || !linkDaVslValido(estado.url) || salvando}>
              Salvar e criar outra
            </Button>
          ) : null}
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-sm font-semibold">Prévia</h3>
        <PreviaDaVslView previa={previa} />
      </aside>

      {/* "+ cadastrar nova": expert e tipo já preenchidos; ao salvar, a nova fica selecionada. */}
      {TIPOS_DE_VARIAVEL.map((tipo) => (
        <FormVariavel key={tipo} aberto={cadastro === tipo} tipo={tipo} linha={null} expertInicial={estado.expertId} onFechar={() => setCadastro(null)} onSalvo={(v) => setEstado((e) => ({ ...e, [CAMPO_DA_VARIAVEL[tipo]]: v.id }))} />
      ))}
      <FormFunilOuOferta recurso="ofertas" aberto={cadastro === "oferta"} linha={null} expertInicial={estado.expertId} onFechar={() => setCadastro(null)} />
    </div>
  );
}
