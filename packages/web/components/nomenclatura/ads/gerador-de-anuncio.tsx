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
 * Story 47.14: página inteira em COLUNA ÚNICA — banner de edição, prévia
 * (acima, D1 confirmada pelo gestor em 16/09), um campo por linha, botões,
 * lista do expert. Todo aviso de "nenhum X cadastrado" vira linha com link
 * para o cadastro (Hooks e bodies já com o expert na URL).
 *
 * Story 47.16: nome v3 — com a sigla `perpetuo` o "Nº do lançamento" fica
 * desabilitado e a sugestão não roda; no vídeo, hook e body seguem escolhidos
 * (e exigidos) mas saem do nome; editar um vídeo publicado mantém o formato
 * dele (v2/antigo, lido do `name`); com a API atrás, Salvar explica em vez de
 * repassar o 400 do zod.
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
// Subpath direto (ver `contract.ts`): o índice do shared não passa pelo webpack do Next.
import { API_CONTRACT_VERSION } from "@loyola-x/shared/src/contract";
import { useApiHealth } from "@/lib/hooks/use-api-health";
import { compareApiContract } from "@/lib/utils/api-contract";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import {
  CLASSE_DO_BLOCO_DO_ANUNCIO,
  ESTADO_VAZIO_DO_ANUNCIO,
  LEGENDA_DO_ANUNCIO,
  aoEscolherNoAnuncio,
  comSugestaoDoLancamento,
  corpoDoAnuncio,
  estadoDeAnuncio,
  ehVideo,
  formatoDoAnuncioGravado,
  mesAnoDe,
  mesCorrente,
  previaDoAnuncio,
  siglaParaSugestao,
  siglaSemNumero,
  textoDoLancamento,
  type EstadoDoAnuncio,
  type FormatoDoVideo,
  type PreviaDoAnuncio,
} from "@/lib/utils/nomenclatura-anuncio";
import { copiarTexto } from "../previa-do-nome";
import { mensagemDeApiAtras, mensagemDeApiAtrasAoSalvarAnuncio } from "@/lib/utils/mensagem-de-api-atras";
import { SeletorDeExpert } from "../seletor-de-expert";

type Modo = { tipo: "novo" } | { tipo: "editar"; id: string } | { tipo: "duplicar"; id: string };

/**
 * Story 47.14 (AC4/AC7): sem opção e sem erro, a frase do aviso vira UMA linha
 * hiperlinkada para o cadastro ("nenhum body cadastrado para dg — cadastrar em
 * Hooks e bodies"). Com `erro` (47.15), o alerta fica no lugar do link — erro ≠
 * vazio. `carregando` evita dizer "nenhum cadastrado" enquanto a lista não chegou.
 */
function SelectDeValor(props: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { value: string; rotulo: string }[];
  desabilitado?: boolean;
  vazio: string;
  cadastro?: { href: string; rotulo: string };
  erro?: string | null;
  carregando?: boolean;
}) {
  const { id, label, valor, onChange, opcoes, desabilitado, vazio, cadastro, erro, carregando } = props;
  const semOpcoes = !desabilitado && !carregando && opcoes.length === 0;
  const placeholder = desabilitado ? "Escolha" : carregando ? "carregando…" : erro ? "erro ao listar — veja abaixo" : semOpcoes ? vazio : "Escolha";
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={valor} onValueChange={onChange} disabled={desabilitado || carregando || semOpcoes}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!desabilitado && erro ? (
        <p role="alert" className="text-xs text-destructive">{erro}</p>
      ) : semOpcoes && cadastro ? (
        <p className="text-xs text-warning">
          <Link className="underline" href={cadastro.href}>{vazio} — cadastrar em {cadastro.rotulo}</Link>
        </p>
      ) : semOpcoes ? (
        /* AC10 (47.10): vazio declarado — sem valores fixos, a tela diz onde cadastrar. */
        <p className="text-xs text-warning">{vazio}</p>
      ) : null}
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
            {/* Story 47.16 (AC4, opção B): a prévia é o NOME — o `--` só aparece com descrição. */}
            {p.campo === "description" && p.valor ? <span className="text-muted-foreground">--</span> : null}
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
        {previa.nome ? (
          previa.faltaForaDoNome.length ? (
            <span className="text-warning">{`${previa.tamanho} caracteres · escolha ${previa.faltaForaDoNome.join(" e ")} — não entram no nome, mas são obrigatórios e gravados.`}</span>
          ) : (
            `${previa.tamanho} caracteres`
          )
        ) : previa.erro ? <span className="text-destructive">{previa.erro}</span> : previa.erroDaDescricao ? <span className="text-destructive">descrição: {previa.erroDaDescricao}</span> : "Preencha expert, tipo, sigla, número do lançamento (menos no perpétuo) e mês para liberar a estrutura."}
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
  // 47.13 AC7 / 47.16 AC8: EDITAR mantém o formato do nome gravado (antigo, v2 ou v3 — lido do `name`); novo e duplicar nascem v3.
  const formato: FormatoDoVideo = modo.tipo === "editar" && origem.data ? formatoDoAnuncioGravado(origem.data) : "v3";
  const padraoAntigo = formato === "antigo";
  // Story 47.16 (AC7): com `perpetuo` não há número — nem campo, nem sugestão.
  const semNumero = siglaSemNumero(estado.launchType);
  const proximo = useProximoNnDeAnuncio(editando ? "" : estado.expertId, siglaParaSugestao(estado));
  // Story 47.16 (AC11): o veredito do contrato (29.46) — com a API atrás, Salvar explica em vez de repassar o 400.
  const saude = useApiHealth();
  const apiAtras = compareApiContract(saude.data?.contract, API_CONTRACT_VERSION).kind === "api-atras";
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
    if (!editando) setEstado((e) => comSugestaoDoLancamento(e, proximo.data?.launchSeqSugerido));
  }, [proximo.data, editando]);

  const partes = useMemo(() => [...(hooks.data ?? []), ...(bodies.data ?? [])].map((p) => ({ id: p.id, code: p.code })), [hooks.data, bodies.data]);
  // Story 47.15 (AC4): erro da query ≠ lista vazia. API atrás vira a frase do banner; outro erro aparece como veio.
  const erroDaLista = (e: unknown, recurso: string) => {
    if (!e) return null;
    const err = erroDaApi(e);
    return mensagemDeApiAtras(err, recurso) ?? `Não foi possível listar ${recurso}: ${err.mensagem}`;
  };
  const erroOrigens = erroDaLista(origens.error, "origens do vídeo");
  // Story 47.14: cada select acusa a própria query — o alerta fica sob o campo que falhou, uma vez.
  const erroHooks = erroDaLista(hooks.error, "hooks e bodies");
  const erroBodies = erroDaLista(bodies.error, "hooks e bodies");
  // 47.13 AC7 / 47.16 AC8: a prévia usa o formato do build (achado do QA na 47.13: sem ele, Salvar ficava desabilitado).
  const previa = useMemo(() => previaDoAnuncio(estado, experts.data ?? [], partes, { formato }), [estado, experts.data, partes, formato]);
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

  const valoresFixos = { href: hrefDe("ads", "valores"), rotulo: "Valores fixos" };
  // AC4: o link de hook/body abre Hooks e bodies já no expert (AC5).
  const hooksEBodies = { href: hrefDe("ads", "partes", { expertId: estado.expertId }), rotulo: "Hooks e bodies" };

  return (
    <div className="space-y-6">
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

      {/* Story 47.14 (AC1/D1): a prévia vem ANTES dos campos — numa coluna só, é o que a pessoa olha enquanto preenche. Sem sticky (D2). */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Prévia</h3>
        <PreviaDoAnuncioView previa={previa} />
      </section>

      {/* Story 47.14 (AC2): onze campos, um por linha — desempilha as linhas duplas/triplas da 47.11/47.13. Ordem inalterada. */}
      <div className="grid max-w-2xl gap-3">
        <SeletorDeExpert valor={estado.expertId} onChange={escolher("expertId")} travado={editando} id="a-expert" />
        <SelectDeValor id="a-tipo" label="Tipo de criativo" valor={estado.creativeType} onChange={escolher("creativeType")} opcoes={opcoesDe(tipos.data)} desabilitado={editando} carregando={tipos.isLoading} vazio="nenhum tipo de criativo ativo" cadastro={valoresFixos} />
        {video && !padraoAntigo ? (
          <SelectDeValor id="a-origem" label="Origem do vídeo" valor={estado.origin} onChange={escolher("origin")} opcoes={opcoesDe(origens.data)} carregando={origens.isLoading} erro={erroOrigens} vazio="nenhuma origem ativa" cadastro={valoresFixos} />
        ) : null}
        {padraoAntigo ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Vídeo do <strong>padrão antigo</strong> (47.10): o nome publicado não muda de formato. Para um nome no formato atual (com origem, hook e body), use <strong>Duplicar</strong>.
          </p>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="a-nn">NN do criativo</Label>
          <Input id="a-nn" value={estado.creativeSeq} onChange={(e) => setEstado((s) => ({ ...s, creativeSeq: e.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder="01" className="w-[140px] font-mono" disabled={editando || !estado.expertId} />
          <p className={cn("text-xs", nnOcupado ? "text-warning" : "text-muted-foreground")}>
            {editando ? "Fixo depois de salvo." : !estado.expertId ? "Escolha o expert." : proximo.data?.creativeSeqTexto ? (nnOcupado ? `Próximo livre é ${proximo.data.creativeSeqTexto}; um NN já usado é recusado ao salvar.` : `Próximo livre de ${experts.data?.find((e) => e.id === estado.expertId)?.code ?? "expert"}: ${proximo.data.creativeSeqTexto}.`) : "Sequência única por expert, qualquer tipo."}
          </p>
        </div>
        <SelectDeValor id="a-sigla" label="Sigla do lançamento" valor={estado.launchType} onChange={escolher("launchType")} opcoes={opcoesDe(siglas.data)} carregando={siglas.isLoading} vazio="nenhuma sigla de lançamento ativa" cadastro={valoresFixos} />
        <div className="space-y-1">
          <Label htmlFor="a-lnn">Nº do lançamento</Label>
          <Input id="a-lnn" value={semNumero ? "" : estado.launchSeq} onChange={(e) => setEstado((s) => ({ ...s, launchSeq: e.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder={semNumero ? "—" : "01"} className="w-[140px] font-mono" disabled={!estado.launchType || semNumero} />
          <p className="text-xs text-muted-foreground">{semNumero ? "perpétuo não tem número — o lançamento entra no nome só como perpetuo." : proximo.data?.launchSeqSugerido ? `Último usado para esta sigla: ${String(proximo.data.launchSeqSugerido).padStart(2, "0")}.` : "O número do lançamento (pg02 = 2º lançamento pago)."}</p>
        </div>
        {/* Story 47.13 (AC9): hook e body DO expert — só em vídeo. Story 47.14 (AC4): sem cadastro, a própria frase é o link, com o expert. */}
        {video && !padraoAntigo ? (
          <>
            <SelectDeValor id="a-hook" label="Hook" valor={estado.hookId} onChange={escolher("hookId")} opcoes={(hooks.data ?? []).map((h) => ({ value: h.id, rotulo: h.rotulo }))} desabilitado={!estado.expertId} carregando={hooks.isLoading} erro={erroHooks} vazio={`nenhum hook cadastrado para ${expertCode || "este expert"}`} cadastro={hooksEBodies} />
            <SelectDeValor id="a-body" label="Body" valor={estado.bodyId} onChange={escolher("bodyId")} opcoes={(bodies.data ?? []).map((b) => ({ value: b.id, rotulo: b.rotulo }))} desabilitado={!estado.expertId} carregando={bodies.isLoading} erro={erroBodies} vazio={`nenhum body cadastrado para ${expertCode || "este expert"}`} cadastro={hooksEBodies} />
          </>
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
          {mensagemDeApiAtrasAoSalvarAnuncio(erro, apiAtras) ?? erro.mensagem}
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
                      <TableCell className="font-mono">{textoDoLancamento(a.launchType, a.launchSeq)}</TableCell>
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
  );
}
