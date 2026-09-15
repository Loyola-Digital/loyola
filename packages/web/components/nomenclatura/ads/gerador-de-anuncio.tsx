"use client";

/**
 * Story 47.10 — "Novo anúncio": expert (o NN do criativo vem preenchido com o
 * próximo livre do expert) → tipo de criativo → sigla do lançamento → número
 * do lançamento (sugerido) → mês/ano (`mm-aaaa`, default mês corrente) →
 * descrição opcional (normalização ao vivo). Prévia colorida por bloco, DOIS
 * botões de copiar (estrutura × nome completo), Salvar reserva o NN, "Salvar
 * e criar outro" mantém expert, sigla, número do lançamento e data.
 *
 * Editar: só descrição, notas, sigla/NN do lançamento e data (D23 — tipo e
 * NN do criativo não mudam depois de salvos). Duplicar: tudo igual, NN novo.
 *
 * As decisões estão em `lib/utils/nomenclatura-anuncio.ts`, com teste.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { erroDaApi, useAnuncio, useAnuncios, useCriarAnuncio, useEditarAnuncio, useListaDe, useProximoNnDeAnuncio, type ErroDaApi } from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import {
  CLASSE_DO_BLOCO_DO_ANUNCIO,
  ESTADO_VAZIO_DO_ANUNCIO,
  LEGENDA_DO_ANUNCIO,
  aoEscolherNoAnuncio,
  corpoDoAnuncio,
  estadoDeAnuncio,
  ehVideo,
  ehVideoDoPadraoAntigo,
  mesAnoDe,
  mesCorrente,
  previaDoAnuncio,
  type EstadoDoAnuncio,
  type PreviaDoAnuncio,
} from "@/lib/utils/nomenclatura-anuncio";
import { copiarTexto } from "../previa-do-nome";
import { SeletorDeExpert } from "../seletor-de-expert";

type Modo = { tipo: "novo" } | { tipo: "editar"; id: string } | { tipo: "duplicar"; id: string };

function SelectDeValor(props: { id: string; label: string; valor: string; onChange: (v: string) => void; opcoes: { value: string; rotulo: string }[]; desabilitado?: boolean; vazio: string }) {
  const { id, label, valor, onChange, opcoes, desabilitado, vazio } = props;
  const semOpcoes = !desabilitado && opcoes.length === 0;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={valor} onValueChange={onChange} disabled={desabilitado || semOpcoes}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={semOpcoes ? vazio : "Escolha"} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* AC10: vazio declarado — sem valores fixos, a tela diz onde cadastrar. */}
      {semOpcoes ? <p className="text-xs text-warning">{vazio}</p> : null}
    </div>
  );
}

function PreviaDoAnuncioView({ previa }: { previa: PreviaDoAnuncio }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGENDA_DO_ANUNCIO.map((l) => (
          <span key={l.bloco} title={l.descricao}>
            <span className={cn("font-semibold", CLASSE_DO_BLOCO_DO_ANUNCIO[l.bloco])}>■</span> {l.rotulo}
          </span>
        ))}
      </div>
      <code className="block overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-base" aria-label="prévia do nome do anúncio">
        {previa.pedacos.map((p, i) => (
          <span key={p.campo}>
            {i > 0 && p.campo !== "description" ? <span className="text-muted-foreground">_</span> : null}
            {p.campo === "description" ? <span className="text-muted-foreground">--</span> : null}
            <span className={p.faltando ? "text-muted-foreground" : CLASSE_DO_BLOCO_DO_ANUNCIO[p.bloco]} title={p.campo}>
              {p.faltando ? "…" : p.valor}
            </span>
          </span>
        ))}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!previa.estrutura} onClick={() => previa.estrutura && void copiarTexto(previa.estrutura)} title="Até o -- inclusive: o que o designer recebe">
          <Copy className="mr-1 h-4 w-4" /> Copiar estrutura
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!previa.nome || previa.nome === previa.estrutura} onClick={() => previa.nome && void copiarTexto(previa.nome)}>
          <Copy className="mr-1 h-4 w-4" /> Copiar nome completo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {previa.nome ? `${previa.tamanho} caracteres` : previa.erro ? <span className="text-destructive">{previa.erro}</span> : previa.erroDaDescricao ? <span className="text-destructive">descrição: {previa.erroDaDescricao}</span> : "Preencha expert, tipo, sigla, número do lançamento e mês para liberar a estrutura."}
      </p>
    </div>
  );
}

export function GeradorDeAnuncio({ modo }: { modo: Modo }) {
  const router = useRouter();
  const idDaOrigem = modo.tipo === "novo" ? null : modo.id;
  const origem = useAnuncio(idDaOrigem);
  const [estado, setEstado] = useState<EstadoDoAnuncio>({ ...ESTADO_VAZIO_DO_ANUNCIO, date: mesCorrente() });
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const criar = useCriarAnuncio();
  const editar = useEditarAnuncio();
  const editando = modo.tipo === "editar";

  const experts = useListaDe("experts");
  const tipos = useListaDe("dicionario", { type: "creative_type" });
  const siglas = useListaDe("dicionario", { type: "launch_type" });
  // Story 47.13: só o vídeo (adv) tem origem, hook e body. Hook/body são DO expert.
  const video = ehVideo(estado.creativeType);
  const origens = useListaDe("dicionario", { type: "creative_origin" }, { enabled: video });
  const hooks = useListaDe("ads/partes", { expertId: estado.expertId, type: "hook" }, { enabled: video && Boolean(estado.expertId) });
  const bodies = useListaDe("ads/partes", { expertId: estado.expertId, type: "body" }, { enabled: video && Boolean(estado.expertId) });
  // AC7: vídeo gravado no padrão antigo (4 campos) — a edição não pede os três; o nome não muda de formato.
  const padraoAntigo = Boolean(origem.data && ehVideoDoPadraoAntigo(origem.data)) && modo.tipo === "editar";
  const proximo = useProximoNnDeAnuncio(editando ? "" : estado.expertId, estado.launchType || undefined);
  // Story 47.11 (AC3): ao escolher o expert, os anúncios já cadastrados dele
  // aparecem abaixo do formulário — mesmo desenho de Nova VSL (47.9), mesma
  // query da aba Anúncios (salvar invalida ["nomenclatura"] e a lista atualiza).
  const existentes = useAnuncios({ expertId: estado.expertId || undefined, limit: 100 });
  const expertCode = experts.data?.find((e) => e.id === estado.expertId)?.code ?? "";

  // Pré-preenchimento UMA vez por id (mesma guarda dos outros geradores).
  const carregadoDe = useRef<string | null>(null);
  useEffect(() => {
    if (origem.data && carregadoDe.current !== origem.data.id && (modo.tipo === "editar" || modo.tipo === "duplicar")) {
      carregadoDe.current = origem.data.id;
      setEstado(estadoDeAnuncio(origem.data, modo.tipo));
    }
  }, [origem.data, modo.tipo]);

  // AC8: o NN do criativo vem preenchido com o próximo livre; se a pessoa já digitou, não sobrescreve.
  useEffect(() => {
    if (!editando && proximo.data?.creativeSeqTexto && !estado.creativeSeq) setEstado((e) => ({ ...e, creativeSeq: proximo.data!.creativeSeqTexto! }));
    if (!editando && proximo.data?.launchSeqSugerido && !estado.launchSeq) setEstado((e) => ({ ...e, launchSeq: String(proximo.data!.launchSeqSugerido).padStart(2, "0") }));
  }, [proximo.data, editando]);

  const partes = useMemo(() => [...(hooks.data ?? []), ...(bodies.data ?? [])].map((p) => ({ id: p.id, code: p.code })), [hooks.data, bodies.data]);
  // AC7: no padrão antigo a prévia é a de 4 campos — o estado não tem os três e o tipo é adv; a prévia normal pediria os três.
  const previa = useMemo(() => (padraoAntigo ? previaDoAnuncio({ ...estado, creativeType: origem.data?.creativeType ?? estado.creativeType }, experts.data ?? [], partes) : previaDoAnuncio(estado, experts.data ?? [], partes)), [estado, experts.data, partes, padraoAntigo, origem.data?.creativeType]);
  const escolher = (campo: keyof EstadoDoAnuncio) => (v: string) => setEstado((e) => aoEscolherNoAnuncio(e, campo, v));
  const nnOcupado = !editando && proximo.data?.creativeSeqTexto && estado.creativeSeq && estado.creativeSeq !== proximo.data.creativeSeqTexto;
  const opcoesDe = (xs: { value: string; description: string | null }[] | undefined) => (xs ?? []).map((v) => ({ value: v.value, rotulo: v.description ? `${v.value} — ${v.description}` : v.value }));

  async function salvar(eOutro = false) {
    setErro(null);
    try {
      const corpo = corpoDoAnuncio(estado);
      const salvo = editando
        ? await editar.mutateAsync({
            id: (modo as { id: string }).id,
            dados: {
              launchType: corpo.launchType,
              launchSeq: corpo.launchSeq,
              date: corpo.date,
              description: corpo.description,
              notes: corpo.notes,
              // Story 47.13: num vídeo v2 os três são editáveis (como lançamento/data); no padrão antigo não vão (AC7)
              ...(video && !padraoAntigo ? { origin: corpo.origin ?? undefined, hookId: corpo.hookId ?? undefined, bodyId: corpo.bodyId ?? undefined } : {}),
            },
          })
        : await criar.mutateAsync(corpo);
      await navigator.clipboard.writeText(salvo.structure).catch(() => undefined);
      if (eOutro) {
        // AC8: mantém expert, sigla, número do lançamento e data — e (47.13 AC9) origem, hook e body; limpa NN (o servidor sugere o próximo), descrição e notas.
        toast.success(<span>Salvo e estrutura copiada: <code className="font-mono">{salvo.structure}</code>. O próximo NN já vem preenchido.</span>, { duration: 8000 });
        setEstado((e) => ({ ...e, creativeSeq: "", description: "", notes: "" }));
        await proximo.refetch();
        return;
      }
      toast.success(<span>Anúncio salvo e estrutura copiada: <code className="font-mono">{salvo.structure}</code></span>, {
        duration: 8000,
        action: { label: "Criar outro", onClick: () => router.push(hrefDe("ads", "novo")) },
      });
      router.push(hrefDe("ads", "lista"));
    } catch (e) {
      const err = erroDaApi(e);
      setErro(err);
      // AC10: corrida no NN — a API manda o próximo livre; já preenche.
      if (err.status === 409 && err.corpo?.sugestao) setEstado((s) => ({ ...s, creativeSeq: String(err.corpo!.sugestao) }));
    }
  }

  const salvando = criar.isPending || editar.isPending;
  if (idDaOrigem && origem.isLoading) return <p className="text-sm text-muted-foreground">Carregando anúncio…</p>;
  if (idDaOrigem && origem.error) return <p className="text-sm text-destructive">{erroDaApi(origem.error).mensagem}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <div className="space-y-4">
        {modo.tipo !== "novo" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>
              {editando ? "Editando" : "Duplicando"} <code className="font-mono">{origem.data?.name}</code>
              {editando ? <span className="ml-2 text-xs text-muted-foreground">tipo e NN do criativo não mudam depois de salvos</span> : null}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={hrefDe("ads", "novo")}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Começar um novo</Link>
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3">
          <SeletorDeExpert valor={estado.expertId} onChange={escolher("expertId")} travado={editando} id="a-expert" />
          {/* Story 47.11 (AC1): Tipo nesta linha; Story 47.13 (AC9): Origem (IA/humano) ao lado quando o tipo é vídeo. */}
          <div className={cn("grid gap-3", video && !padraoAntigo ? "sm:grid-cols-[1fr_220px]" : "sm:grid-cols-1")}>
            <SelectDeValor id="a-tipo" label="Tipo de criativo" valor={estado.creativeType} onChange={escolher("creativeType")} opcoes={opcoesDe(tipos.data)} desabilitado={editando} vazio="nenhum tipo de criativo ativo — cadastre em Valores fixos" />
            {video && !padraoAntigo ? (
              <SelectDeValor id="a-origem" label="Origem do vídeo" valor={estado.origin} onChange={escolher("origin")} opcoes={opcoesDe(origens.data)} vazio="nenhuma origem ativa — cadastre em Valores fixos (ia · h)" />
            ) : null}
          </div>
          {padraoAntigo ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Vídeo do <strong>padrão antigo</strong> (47.10): o nome publicado não muda de formato. Para um nome no v2 (origem, hook e body), use <strong>Duplicar</strong>.
            </p>
          ) : null}
          {/* Story 47.11 (AC1): NN do criativo | Sigla do lançamento | Nº do lançamento
              na MESMA linha (pedido do gestor, 15/09). Ordem de tabulação NN → Sigla → Nº. */}
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_140px]">
            <div className="space-y-1">
              <Label htmlFor="a-nn">NN do criativo</Label>
              <Input id="a-nn" value={estado.creativeSeq} onChange={(e) => setEstado((s) => ({ ...s, creativeSeq: e.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder="01" className="font-mono" disabled={editando || !estado.expertId} />
              <p className={cn("text-xs", nnOcupado ? "text-warning" : "text-muted-foreground")}>
                {editando ? "Fixo depois de salvo." : !estado.expertId ? "Escolha o expert." : proximo.data?.creativeSeqTexto ? (nnOcupado ? `Próximo livre é ${proximo.data.creativeSeqTexto}; um NN já usado é recusado ao salvar.` : `Próximo livre de ${experts.data?.find((e) => e.id === estado.expertId)?.code ?? "expert"}: ${proximo.data.creativeSeqTexto}.`) : "Sequência única por expert, qualquer tipo."}
              </p>
            </div>
            <SelectDeValor id="a-sigla" label="Sigla do lançamento" valor={estado.launchType} onChange={escolher("launchType")} opcoes={opcoesDe(siglas.data)} vazio="nenhuma sigla de lançamento ativa — cadastre em Valores fixos" />
            <div className="space-y-1">
              <Label htmlFor="a-lnn">Nº do lançamento</Label>
              <Input id="a-lnn" value={estado.launchSeq} onChange={(e) => setEstado((s) => ({ ...s, launchSeq: e.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder="01" className="font-mono" disabled={!estado.launchType} />
              <p className="text-xs text-muted-foreground">{proximo.data?.launchSeqSugerido ? `Último usado para esta sigla: ${String(proximo.data.launchSeqSugerido).padStart(2, "0")}.` : "O número do lançamento (pg02 = 2º lançamento pago)."}</p>
            </div>
          </div>
          {/* Story 47.13 (AC9): hook e body DO expert — só em vídeo; sem cadastro, o link leva à aba Hooks e bodies. */}
          {video && !padraoAntigo ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectDeValor id="a-hook" label="Hook" valor={estado.hookId} onChange={escolher("hookId")} opcoes={(hooks.data ?? []).map((h) => ({ value: h.id, rotulo: h.rotulo }))} desabilitado={!estado.expertId} vazio={estado.expertId ? `nenhum hook cadastrado para ${expertCode || "este expert"}` : "escolha o expert"} />
              <SelectDeValor id="a-body" label="Body" valor={estado.bodyId} onChange={escolher("bodyId")} opcoes={(bodies.data ?? []).map((b) => ({ value: b.id, rotulo: b.rotulo }))} desabilitado={!estado.expertId} vazio={estado.expertId ? `nenhum body cadastrado para ${expertCode || "este expert"}` : "escolha o expert"} />
              {estado.expertId && !hooks.isLoading && !bodies.isLoading && ((hooks.data?.length ?? 0) === 0 || (bodies.data?.length ?? 0) === 0) ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Vídeo exige hook e body do expert. <Link className="underline" href={hrefDe("ads", "partes")}>Cadastrar em Hooks e bodies</Link>.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="a-mes">Mês e ano</Label>
            <Input id="a-mes" type="month" value={estado.date ? `${estado.date.slice(3)}-${estado.date.slice(0, 2)}` : ""} onChange={(e) => { const v = e.target.value; setEstado((s) => ({ ...s, date: v ? `${v.slice(5, 7)}-${v.slice(0, 4)}` : "" })); }} className="w-[200px]" />
            <p className="text-xs text-muted-foreground">Entra no nome como <span className="font-mono">{estado.date || "mm-aaaa"}</span>.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-desc">Descrição (opcional — o designer pode personalizar depois do --)</Label>
            <Input id="a-desc" value={estado.description} onChange={(e) => setEstado((s) => ({ ...s, description: e.target.value }))} placeholder="gancho-demissao" className="font-mono" />
            {previa.erroDaDescricao ? <p className="text-xs text-destructive">{previa.erroDaDescricao}</p> : <p className="text-xs text-muted-foreground">Espaço vira -, acento sai; _ e -- não entram.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-notas">Observações (opcional)</Label>
            <Textarea id="a-notas" value={estado.notes} onChange={(e) => setEstado((s) => ({ ...s, notes: e.target.value }))} rows={2} />
          </div>
        </div>

        {erro ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro.mensagem}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void salvar()} disabled={!previa.completo || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editando ? "Salvar alterações" : "Salvar"}
          </Button>
          {!editando ? (
            <Button type="button" variant="secondary" onClick={() => void salvar(true)} disabled={!previa.completo || salvando}>
              Salvar e criar outro
            </Button>
          ) : null}
        </div>

        {/* Story 47.11 (AC3–AC5): anúncios já cadastrados do expert escolhido.
            Molde: gerador-de-vsl.tsx ("VSLs de {expert}"). Vazio e erro
            declarados (AC4); a lista atualiza ao salvar porque o POST invalida
            ["nomenclatura"], a mesma chave da aba Anúncios (AC5). */}
        {estado.expertId ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Anúncios de <span className="font-mono">{expertCode || "…"}</span>
            </h3>
            {existentes.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : existentes.error ? (
              <p className="text-sm text-destructive" role="alert">Não foi possível listar os anúncios: {erroDaApi(existentes.error).mensagem}</p>
            ) : (existentes.data?.itens.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">nenhum anúncio cadastrado para {expertCode || "este expert"} ainda</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estrutura</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Lançamento</TableHead>
                      <TableHead>Hook</TableHead>
                      <TableHead>Body</TableHead>
                      <TableHead>Mês/ano</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existentes.data!.itens.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <code className="font-mono text-sm">{a.structure}</code>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Copiar estrutura" aria-label={`Copiar ${a.structure}`} onClick={() => void copiarTexto(a.structure)}><Copy className="h-3.5 w-3.5" /></Button>
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs" title={a.description ?? ""}>{a.description ?? "—"}</TableCell>
                        <TableCell className="font-mono">{a.creativeType}{String(a.creativeSeq).padStart(2, "0")}{a.legado ? <span className="ml-1 text-[10px] text-warning" title="padrão antigo (47.10): sem origem, hook e body">antigo</span> : null}</TableCell>
                        <TableCell className="font-mono">{a.origin ?? "—"}</TableCell>
                        <TableCell className="font-mono">{a.launchType}{String(a.launchSeq).padStart(2, "0")}</TableCell>
                        <TableCell className="font-mono">{a.hookCode ?? "—"}</TableCell>
                        <TableCell className="font-mono">{a.bodyCode ?? "—"}</TableCell>
                        <TableCell className="font-mono">{mesAnoDe(a.adDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-sm font-semibold">Prévia</h3>
        <PreviaDoAnuncioView previa={previa} />
      </aside>
    </div>
  );
}
