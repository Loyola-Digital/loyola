"use client";

/**
 * Story 47.3 — "Nova campanha" (spec § 7): 11 campos em cascata, prévia ao
 * vivo, "+ cadastrar novo" nos selects de produto/funil/oferta/LP, Salvar,
 * Marcar como publicada e Duplicar. Também serve para Editar (não publicada)
 * e para Duplicar (pré-preenchido, sem published_at nem meta_campaign_id).
 *
 * As decisões (cascata, opções fixas, prévia, corpo da API) estão em
 * `lib/utils/nomenclatura-gerador.ts`, com teste. Aqui só se desenha.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Lock, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  erroDaApi,
  useCampanha,
  useClassificarLegada,
  useCriarCampanha,
  useEditarCampanha,
  useListaDe,
  usePublicarCampanha,
  type Campanha,
  type ErroDaApi,
  type Lp,
} from "@/lib/hooks/use-nomenclatura";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";
import {
  ESTADO_VAZIO,
  anoPadrao,
  aoEscolher,
  camposDoNome,
  corpoDaCampanha,
  estadoDeCampanha,
  opcoesDeLp,
  opcoesDeOferta,
  previaDoNome,
  type EstadoDoGerador,
  type Opcao,
} from "@/lib/utils/nomenclatura-gerador";
import { CASCATA_VAZIA } from "@/lib/utils/nomenclatura-cascata";
import { FormFunilOuOferta, FormLp, FormProduto } from "./forms";
import { PreviaDoNome } from "./previa-do-nome";
import { SeletorDeExpert } from "./seletor-de-expert";

type Modo =
  | { tipo: "nova" }
  | { tipo: "editar"; id: string }
  | { tipo: "duplicar"; id: string }
  /** Story 47.5: classificar uma campanha antiga do Meta — expert travado (vem do projeto), estado inicial da sugestão, salva pela rota de legadas. */
  | { tipo: "legada"; projectId: string; campaignId: string; nomeAntigo: string; inicial: EstadoDoGerador; onSalvo: (c: Campanha) => void };

function SelectDoGerador(props: { id: string; label: string; valor: string; onChange: (v: string) => void; opcoes: Opcao[]; desabilitado?: boolean; placeholder?: string; aoCadastrar?: () => void; travado?: boolean }) {
  const { id, label, valor, onChange, opcoes, desabilitado, placeholder, aoCadastrar, travado } = props;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {aoCadastrar && !travado ? (
          <button type="button" onClick={aoCadastrar} className="text-xs text-muted-foreground underline-offset-2 hover:underline" disabled={desabilitado}>
            <Plus className="mr-0.5 inline h-3 w-3" />
            cadastrar novo
          </button>
        ) : null}
      </div>
      <Select value={valor} onValueChange={onChange} disabled={desabilitado || travado}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder ?? "Escolha"} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.value} value={o.value} className={o.fixa ? "border-t mt-1 pt-2 text-muted-foreground" : undefined}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function GeradorDeCampanha({ modo }: { modo: Modo }) {
  const router = useRouter();
  const idDaOrigem = modo.tipo === "editar" || modo.tipo === "duplicar" ? modo.id : null;
  const origem = useCampanha(idDaOrigem);
  const [estado, setEstado] = useState<EstadoDoGerador>(modo.tipo === "legada" ? modo.inicial : ESTADO_VAZIO);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [sufixoAberto, setSufixoAberto] = useState(false);
  const [cadastro, setCadastro] = useState<"produto" | "funil" | "oferta" | "lp" | null>(null);

  const criar = useCriarCampanha();
  const editar = useEditarCampanha();
  const publicar = usePublicarCampanha();
  const classificar = useClassificarLegada();
  const ehLegada = modo.tipo === "legada";
  const publicada = modo.tipo === "editar" && Boolean(origem.data?.publishedAt);

  // Listas: só ATIVOS (regra 8) — o gerador nunca oferece código desativado.
  const experts = useListaDe("experts");
  const produtos = useListaDe("produtos", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const funis = useListaDe("funis", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const ofertas = useListaDe("ofertas", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const lps = useListaDe("lps", { expertId: estado.expertId }, { enabled: Boolean(estado.expertId) });
  const valores = useListaDe("dicionario");

  // Pré-preenchimento (editar/duplicar) — sem published_at nem meta id no duplicar.
  // UMA vez por id: qualquer mutação invalida ["nomenclatura"] e refaz a query da
  // origem; sem esta guarda, cadastrar uma oferta pelo "+ cadastrar novo" durante a
  // edição devolvia o formulário ao estado do banco e apagava o que se escolheu.
  const carregadoDe = useRef<string | null>(null);
  useEffect(() => {
    if (origem.data && carregadoDe.current !== origem.data.id) {
      carregadoDe.current = origem.data.id;
      setEstado(estadoDeCampanha(origem.data));
      setSufixoAberto(Boolean(origem.data.suffix));
    }
  }, [origem.data]);

  // Ano corrente pré-selecionado se existir no dicionário (só na criação, uma vez).
  useEffect(() => {
    if (modo.tipo === "nova" && valores.data && !estado.year) {
      const ano = anoPadrao(valores.data.filter((v) => v.type === "year"), new Date().getFullYear());
      if (ano) setEstado((e) => ({ ...e, year: ano }));
    }
  }, [valores.data, modo.tipo]);

  const porTipo = (type: "year" | "temperature" | "auction" | "format"): Opcao[] =>
    (valores.data ?? []).filter((v) => v.type === type).map((v) => ({ value: v.value, rotulo: v.description ? `${v.value} — ${v.description}` : v.value }));

  const previa = useMemo(
    () =>
      previaDoNome(
        camposDoNome(estado, {
          experts: experts.data ?? [],
          produtos: produtos.data ?? [],
          funis: funis.data ?? [],
          ofertas: ofertas.data ?? [],
          lps: lps.data ?? [],
        }),
      ),
    [estado, experts.data, produtos.data, funis.data, ofertas.data, lps.data],
  );

  const escolher = (campo: keyof EstadoDoGerador) => (v: string) => setEstado((e) => aoEscolher(e, campo, v));

  async function salvar() {
    setErro(null);
    try {
      const corpo = corpoDaCampanha(estado);
      if (modo.tipo === "legada") {
        const salva = await classificar.mutateAsync({ projectId: modo.projectId, campaignId: modo.campaignId, dados: corpo });
        toast.success(
          <span>
            Classificada como <code className="font-mono">{salva.name}</code>
          </span>,
        );
        modo.onSalvo(salva);
        return;
      }
      const salva = modo.tipo === "editar" ? await editar.mutateAsync({ id: modo.id, dados: corpo }) : await criar.mutateAsync(corpo);
      await navigator.clipboard.writeText(salva.name).catch(() => undefined);
      toast.success(
        <span>
          Campanha salva e nome copiado: <code className="font-mono">{salva.name}</code>
        </span>,
        { duration: 8000, action: { label: "Criar outra", onClick: () => router.push(hrefDe("campanhas", "nova")) } },
      );
      router.push(hrefDe("campanhas", "lista"));
    } catch (e) {
      setErro(erroDaApi(e));
    }
  }

  async function marcarPublicada() {
    if (modo.tipo !== "editar") return;
    if (!confirm("Marcar como publicada congela o nome: a partir daí só dá para duplicar. Continuar?")) return;
    try {
      await publicar.mutateAsync({ id: modo.id });
      toast.success("Marcada como publicada. O nome está congelado.");
    } catch (e) {
      setErro(erroDaApi(e));
    }
  }

  const salvando = criar.isPending || editar.isPending || classificar.isPending;
  const lpsParaOpcoes = (lps.data ?? []).map((l: Lp) => ({ id: l.id, code: l.code, slug: l.slug, productId: l.productId, funnelId: l.funnelId, offerId: l.offerId }));
  // Memoizado (gate do @qa, QA-473-01): `FormLp` reseta o próprio estado quando
  // `cascataInicial` muda de identidade. Um objeto novo a cada render do
  // gerador zerava o formulário da LP a cada tecla digitada nele.
  const cascataParaLp = useMemo(
    () => (estado.expertId ? { ...CASCATA_VAZIA, expertId: estado.expertId, productId: estado.productId, funnelId: estado.funnelId, offerId: estado.offerId === "ofmix" ? "" : estado.offerId } : undefined),
    [estado.expertId, estado.productId, estado.funnelId, estado.offerId],
  );

  if (idDaOrigem && origem.isLoading) return <p className="text-sm text-muted-foreground">Carregando campanha…</p>;
  if (idDaOrigem && origem.error) return <p className="text-sm text-destructive">{erroDaApi(origem.error).mensagem}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <div className="space-y-4">
        {ehLegada ? (
          <p className="rounded-md border px-3 py-2 text-sm">
            Classificando <code className="font-mono">{(modo as { nomeAntigo: string }).nomeAntigo}</code>. O nome no Meta não muda; o nome novo é o rótulo que o cruzamento vai usar. Campos vazios não foram reconhecidos no nome antigo.
          </p>
        ) : null}
        {modo.tipo === "editar" || modo.tipo === "duplicar" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>
              {modo.tipo === "editar" ? "Editando" : "Duplicando"} <code className="font-mono">{origem.data?.name}</code>
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={hrefDe("campanhas", "nova")}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Começar uma nova</Link>
            </Button>
          </div>
        ) : null}
        {publicada ? (
          <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <Lock className="h-4 w-4" /> Campanha publicada: o nome está congelado na Meta. Só observações e o id da Meta editam. Para outra variação, <strong className="ml-1">Duplicar</strong>.
          </p>
        ) : null}
        {modo.tipo === "duplicar" ? <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Duplicando <code className="font-mono">{origem.data?.name}</code> — ajuste o que muda e salve como nova.</p> : null}

        {/* Identidade em linhas separadas (validação visual: o menu aberto do Funil
            cobria o da Oferta quando ficavam lado a lado — os rótulos são longos). */}
        <div className="grid gap-3">
          <div>
            <SeletorDeExpert valor={estado.expertId} onChange={escolher("expertId")} travado={publicada || ehLegada} id="g-expert" />
            {!estado.expertId ? <p className="mt-1 text-xs text-muted-foreground">Comece pelo expert — produto, funil, oferta e LP liberam em cascata.</p> : ehLegada ? <p className="mt-1 text-xs text-muted-foreground">Expert vem do projeto da campanha; não se escolhe aqui.</p> : null}
          </div>
          <SelectDoGerador id="g-produto" label="Produto" valor={estado.productId} onChange={escolher("productId")} opcoes={(produtos.data ?? []).map((p) => ({ value: p.id, rotulo: `${p.slug} — ${p.name}` }))} desabilitado={!estado.expertId} travado={publicada} aoCadastrar={() => setCadastro("produto")} />
          <SelectDoGerador id="g-funil" label="Funil" valor={estado.funnelId} onChange={escolher("funnelId")} opcoes={(funis.data ?? []).map((f) => ({ value: f.id, rotulo: f.rotulo }))} desabilitado={!estado.expertId} travado={publicada} aoCadastrar={() => setCadastro("funil")} />
          <SelectDoGerador id="g-oferta" label="Oferta" valor={estado.offerId} onChange={escolher("offerId")} opcoes={opcoesDeOferta((ofertas.data ?? []).map((o) => ({ id: o.id, rotulo: o.rotulo })))} desabilitado={!estado.expertId} travado={publicada} aoCadastrar={() => setCadastro("oferta")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectDoGerador id="g-ano" label="Ano" valor={estado.year} onChange={escolher("year")} opcoes={porTipo("year")} travado={publicada} />
          <SelectDoGerador id="g-temp" label="Temperatura" valor={estado.temperature} onChange={escolher("temperature")} opcoes={porTipo("temperature")} travado={publicada} />
          <SelectDoGerador id="g-leilao" label="Leilão" valor={estado.auction} onChange={escolher("auction")} opcoes={porTipo("auction")} travado={publicada} />
          <SelectDoGerador id="g-formato" label="Formato" valor={estado.format} onChange={escolher("format")} opcoes={porTipo("format")} travado={publicada} />
        </div>
        <div className="grid gap-3">
          <div>
            <SelectDoGerador id="g-lp" label="LP" valor={estado.lpId} onChange={escolher("lpId")} opcoes={opcoesDeLp(lpsParaOpcoes, estado)} desabilitado={!estado.productId || !estado.funnelId || !estado.offerId} placeholder={estado.offerId ? "LP da combinação, ou lpmix / na" : "Escolha produto, funil e oferta antes"} travado={publicada} aoCadastrar={() => setCadastro("lp")} />
          </div>
        </div>

        <Collapsible open={sufixoAberto} onOpenChange={setSufixoAberto}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${sufixoAberto ? "rotate-180" : ""}`} /> Sufixo (opcional)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-2">
            <Input id="g-sufixo" value={estado.suffix} onChange={(e) => setEstado((s) => ({ ...s, suffix: e.target.value.trim().toLowerCase() }))} placeholder="v02" className="w-[120px] font-mono" disabled={publicada} />
            <p className="text-xs text-muted-foreground">Só para distinguir duas campanhas idênticas no mesmo ano. Entra no fim do nome.</p>
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-1">
          <Label htmlFor="g-notas">Observações (opcional)</Label>
          <Textarea id="g-notas" value={estado.notes} onChange={(e) => setEstado((s) => ({ ...s, notes: e.target.value }))} rows={2} />
        </div>

        {erro ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro.mensagem}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {publicada ? (
            <>
              <Button type="button" onClick={() => router.push(`${hrefDe("campanhas", "nova")}&duplicar=${modo.tipo === "editar" ? modo.id : ""}`)}>
                Duplicar
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={hrefDe("campanhas", "nova")}><Plus className="mr-1 h-4 w-4" /> Nova campanha</Link>
              </Button>
              <Button type="button" variant="outline" disabled={salvando} onClick={() => void (async () => { setErro(null); try { await editar.mutateAsync({ id: (modo as { id: string }).id, dados: { notes: estado.notes.trim() || null } }); toast.success("Observações salvas."); } catch (e) { setErro(erroDaApi(e)); } })()}>
                Salvar observações
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => void salvar()} disabled={!previa.completo || salvando}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {modo.tipo === "editar" ? "Salvar alterações" : ehLegada ? "Classificar" : "Salvar"}
              </Button>
              {modo.tipo === "editar" ? (
                <Button type="button" variant="outline" onClick={() => void marcarPublicada()} disabled={publicar.isPending}>
                  Marcar como publicada
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-sm font-semibold">Prévia</h3>
        <PreviaDoNome previa={previa} />
      </aside>

      {/* "+ cadastrar novo" — os formulários da 47.2, já com o expert (e a combinação) preenchidos; ao salvar, o novo fica selecionado. */}
      <FormProduto aberto={cadastro === "produto"} linha={null} expertInicial={estado.expertId} onFechar={() => setCadastro(null)} />
      <FormFunilOuOferta recurso="funis" aberto={cadastro === "funil"} linha={null} expertInicial={estado.expertId} onFechar={() => setCadastro(null)} />
      <FormFunilOuOferta recurso="ofertas" aberto={cadastro === "oferta"} linha={null} expertInicial={estado.expertId} onFechar={() => setCadastro(null)} />
      <FormLp aberto={cadastro === "lp"} linha={null} cascataInicial={cascataParaLp} onFechar={() => setCadastro(null)} onSalvo={(lp) => setEstado((e) => ({ ...e, lpId: lp.id }))} />
    </div>
  );
}
