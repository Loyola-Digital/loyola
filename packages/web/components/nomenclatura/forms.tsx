"use client";

/**
 * Story 47.2 — os formulários das seis abas (spec § 6).
 *
 * Cada um é dono do próprio Dialog e da própria mutação; a aba só diz "abre
 * para criar" ou "abre para editar esta linha". O que é comum (erro literal
 * do servidor, Salvar desabilitado enquanto falta campo, campo travado quando
 * usado) está em `FormularioDialogo` e `CampoImutavel`.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  erroDaApi,
  useCriar,
  useEditar,
  useListaDe,
  useProximoCodigo,
  type ErroDaApi,
  type Expert,
  type FunilOuOferta,
  type Lp,
  type Produto,
  type TipoDeValor,
  type ValorFixo,
} from "@/lib/hooks/use-nomenclatura";
import {
  AVISO_DE_DESCRICAO_USADA,
  CASCATA_VAZIA,
  aoTrocarNivel,
  cascataCompleta,
  previaDeSlug,
  type Cascata,
} from "@/lib/utils/nomenclatura-cascata";
import { CampoImutavel } from "./campo-imutavel";
import { FormularioDialogo } from "./formulario-dialogo";
import { SeletorDeExpert } from "./seletor-de-expert";
import { useProjects } from "@/lib/hooks/use-projects";

/** Hoje no fuso do navegador, `AAAA-MM-DD` — `toISOString()` daria o dia de UTC. */
function hoje(): string {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

/** Salva e traduz o erro; devolve `true` se salvou. */
function useSalvar() {
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  async function tentar(fn: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    setErro(null);
    try {
      await fn();
      toast.success(sucesso);
      return true;
    } catch (e) {
      setErro(erroDaApi(e));
      return false;
    }
  }
  return { erro, setErro, tentar };
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch {
    toast.error("Não consegui copiar — selecione e copie à mão.");
  }
}

// ─────────────────────────── Expert ───────────────────────────
export function FormExpert(props: { aberto: boolean; linha: Expert | null; onFechar: () => void }) {
  const { aberto, linha, onFechar } = props;
  const criar = useCriar("experts");
  const editar = useEditar("experts");
  const { erro, setErro, tentar } = useSalvar();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const projetos = useProjects();
  const NENHUM = "__nenhum__";
  useEffect(() => {
    setCode(linha?.code ?? "");
    setName(linha?.name ?? "");
    setProjectId(linha?.projectId ?? "");
    setErro(null);
  }, [linha, aberto, setErro]);

  async function salvar() {
    const dados = { name, projectId: projectId || null };
    const ok = linha
      ? await tentar(() => editar.mutateAsync({ id: linha.id, dados }), `Expert ${linha.code} atualizado.`)
      : await tentar(() => criar.mutateAsync({ code, ...dados }), `Expert ${code.toLowerCase()} criado.`);
    if (ok) onFechar();
  }
  return (
    <FormularioDialogo aberto={aberto} onFechar={onFechar} titulo={linha ? `Editar expert ${linha.code}` : "Novo expert"} onSalvar={salvar} salvando={criar.isPending || editar.isPending} podeSalvar={Boolean(name.trim()) && (Boolean(linha) || Boolean(code.trim()))} erro={erro}>
      <CampoImutavel id="code" label="Sigla" valor={code} onChange={setCode} tipo="expert" travadoPorque={linha ? "A sigla não muda depois de criada. Para outro significado, crie outro expert." : undefined} placeholder="bbe" ajuda="2 a 4 letras. Entra no nome de toda campanha deste expert." autoFocus={!linha} />
      <div className="space-y-1">
        <Label htmlFor="name">Nome de exibição</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Netão" autoFocus={Boolean(linha)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="projeto">Projeto do Loyola X (opcional)</Label>
        <Select value={projectId || NENHUM} onValueChange={(v) => setProjectId(v === NENHUM ? "" : v)}>
          <SelectTrigger id="projeto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUM}>Nenhum</SelectItem>
            {(projetos.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">É o que deduz o expert das campanhas legadas do projeto. Um projeto tem um expert só.</p>
      </div>
    </FormularioDialogo>
  );
}

// ─────────────────────────── Produto ───────────────────────────
export function FormProduto(props: { aberto: boolean; linha: Produto | null; expertInicial?: string; onFechar: () => void }) {
  const { aberto, linha, expertInicial, onFechar } = props;
  const criar = useCriar("produtos");
  const editar = useEditar("produtos");
  const { erro, setErro, tentar } = useSalvar();
  const [expertId, setExpertId] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    setExpertId(linha?.expertId ?? expertInicial ?? "");
    setSlug(linha?.slug ?? "");
    setName(linha?.name ?? "");
    setDescription(linha?.description ?? "");
    setErro(null);
  }, [linha, aberto, expertInicial, setErro]);

  async function salvar() {
    const dados = { slug, name, description: description.trim() || null };
    const ok = linha
      ? await tentar(() => editar.mutateAsync({ id: linha.id, dados }), `Produto atualizado.`)
      : await tentar(() => criar.mutateAsync({ ...dados, expertId, description: description.trim() || undefined }), `Produto criado.`);
    if (ok) onFechar();
  }
  return (
    <FormularioDialogo aberto={aberto} onFechar={onFechar} titulo={linha ? `Editar produto ${linha.slug}` : "Novo produto"} onSalvar={salvar} salvando={criar.isPending || editar.isPending} podeSalvar={Boolean(expertId && slug.trim() && name.trim())} erro={erro}>
      <SeletorDeExpert valor={expertId} onChange={setExpertId} travado={Boolean(linha)} />
      <CampoImutavel id="slug" label="Slug" valor={slug} onChange={setSlug} tipo="produto" usadoEm={linha?.usadoEm ?? 0} placeholder="churrasco" ajuda="Até 20 caracteres em [a-z0-9-]. Espaço vira -, acento sai; _ não entra." />
      <div className="space-y-1">
        <Label htmlFor="pname">Nome</Label>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Curso de Churrasco" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pdesc">Descrição (opcional)</Label>
        <Textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
    </FormularioDialogo>
  );
}

// ─────────────────── Funil e Oferta (mesmo formulário) ───────────────────
export function FormFunilOuOferta(props: { recurso: "funis" | "ofertas"; aberto: boolean; linha: FunilOuOferta | null; expertInicial?: string; onFechar: () => void }) {
  const { recurso, aberto, linha, expertInicial, onFechar } = props;
  const ehFunil = recurso === "funis";
  const criar = useCriar(recurso);
  const editar = useEditar(recurso);
  const { erro, setErro, tentar } = useSalvar();
  const [expertId, setExpertId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [startedAt, setStartedAt] = useState(hoje());
  const [avisoDescricao, setAvisoDescricao] = useState(false);
  const sugestao = useProximoCodigo(recurso, { expertId }, aberto && !linha && Boolean(expertId));

  useEffect(() => {
    setExpertId(linha?.expertId ?? expertInicial ?? "");
    setCode(linha?.code ?? "");
    setDescription(linha?.description ?? "");
    setStartedAt(linha?.startedAt?.slice(0, 10) ?? hoje());
    setAvisoDescricao(false);
    setErro(null);
  }, [linha, aberto, expertInicial, setErro]);

  // Código sugerido preenche o campo vazio; se a pessoa já digitou, não sobrescreve.
  useEffect(() => {
    if (!linha && sugestao.data?.codigo && !code) setCode(sugestao.data.codigo);
  }, [sugestao.data?.codigo, linha]);

  async function salvar(eOutra = false) {
    const rotulo = ehFunil ? "Funil" : "Oferta";
    const ok = linha
      ? await tentar(() => editar.mutateAsync({ id: linha.id, dados: { code, description, startedAt } }), `${rotulo} ${linha.code} atualizado.`)
      : await tentar(() => criar.mutateAsync({ expertId, code, description, startedAt }), `${rotulo} ${code} criado.`);
    if (!ok) return;
    if (eOutra && !linha) {
      // Mantém o expert e busca o PRÓXIMO código explicitamente. Não dá para
      // confiar no efeito da sugestão: a invalidação do salvar já refez a
      // busca enquanto o campo ainda tinha o código anterior, e limpar depois
      // não dispara o efeito de novo (visto pelo dono: parou de ser sequencial).
      setDescription("");
      setAvisoDescricao(false);
      const proximo = await sugestao.refetch();
      setCode(proximo.data?.codigo ?? "");
      return;
    }
    onFechar();
  }
  return (
    <FormularioDialogo aberto={aberto} onFechar={onFechar} titulo={linha ? `Editar ${ehFunil ? "funil" : "oferta"} ${linha.code}` : ehFunil ? "Novo funil" : "Nova oferta"} descricao={ehFunil ? "A descrição é o mecanismo do funil — é o que aparece no select do gerador." : "A descrição é o que a pessoa vai ler no gerador: preço, parcelamento, bump, garantia."} onSalvar={() => salvar(false)} onSalvarEOutra={linha ? undefined : () => salvar(true)} salvando={criar.isPending || editar.isPending} podeSalvar={Boolean(expertId && code.trim() && description.trim())} erro={erro}>
      <SeletorDeExpert valor={expertId} onChange={(v) => { setExpertId(v); setCode(""); }} travado={Boolean(linha)} />
      <CampoImutavel id="code" label="Código" valor={code} onChange={setCode} tipo={ehFunil ? "funil" : "oferta"} usadoEm={linha?.usadoEm ?? 0} placeholder={ehFunil ? "a01" : "of01"} ajuda={!linha && sugestao.data?.codigo ? `Sugerido: ${sugestao.data.codigo} (próximo livre deste expert, contando inativos).` : ehFunil ? "a + dois dígitos, por expert." : "of + dois dígitos, por expert."} />
      <div className="space-y-1">
        <Label htmlFor="desc">Descrição (obrigatória)</Label>
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} onFocus={() => setAvisoDescricao((linha?.usadoEm ?? 0) > 0)} rows={3} placeholder={ehFunil ? "Ex.: VSL direto para checkout · Aula perpétua → oferta · Quiz → VSL" : "Ex.: oferta com ticket médio de R$ 347, 12x, com order bump"} />
        {avisoDescricao ? <p className="text-xs text-warning">{AVISO_DE_DESCRICAO_USADA}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="startedAt">Data de início</Label>
        <Input id="startedAt" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="w-[180px]" />
      </div>
    </FormularioDialogo>
  );
}

// ─────────────────────────── LP ───────────────────────────
/** Os quatro selects em cascata, reutilizados pelo filtro da aba e pelo formulário. */
export function CascataDeSelects(props: { valor: Cascata; onChange: (c: Cascata) => void; travado?: boolean; compacto?: boolean }) {
  const { valor, onChange, travado, compacto } = props;
  const produtos = useListaDe("produtos", { expertId: valor.expertId }, { enabled: Boolean(valor.expertId) });
  const funis = useListaDe("funis", { expertId: valor.expertId }, { enabled: Boolean(valor.expertId) });
  const ofertas = useListaDe("ofertas", { expertId: valor.expertId }, { enabled: Boolean(valor.expertId) });
  const cls = compacto ? "text-xs text-muted-foreground" : undefined;
  const nivel = (id: "productId" | "funnelId" | "offerId", label: string, opcoes: { id: string; rotulo: string }[] | undefined, placeholder: string) => (
    <div className="space-y-1">
      <Label htmlFor={id} className={cls}>
        {label}
      </Label>
      <Select value={valor[id]} onValueChange={(v) => onChange(aoTrocarNivel(valor, id, v))} disabled={travado || !valor.expertId}>
        <SelectTrigger id={id} className="min-w-[200px]">
          <SelectValue placeholder={valor.expertId ? placeholder : "Escolha o expert antes"} />
        </SelectTrigger>
        <SelectContent>
          {(opcoes ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <>
      <SeletorDeExpert valor={valor.expertId} onChange={(v) => onChange(aoTrocarNivel(valor, "expertId", v))} travado={travado} label="Expert" permitirTodos={compacto} />
      {nivel("productId", "Produto", produtos.data?.map((p) => ({ id: p.id, rotulo: `${p.slug} — ${p.name}` })), "Produto")}
      {nivel("funnelId", "Funil", funis.data?.map((f) => ({ id: f.id, rotulo: f.rotulo })), "Funil")}
      {nivel("offerId", "Oferta", ofertas.data?.map((o) => ({ id: o.id, rotulo: o.rotulo })), "Oferta")}
    </>
  );
}

export function FormLp(props: { aberto: boolean; linha: Lp | null; cascataInicial?: Cascata; onFechar: () => void; onSalvo?: (lp: Lp) => void }) {
  const { aberto, linha, cascataInicial, onFechar, onSalvo } = props;
  const criar = useCriar("lps");
  const editar = useEditar("lps");
  const { erro, setErro, tentar } = useSalvar();
  const [cascata, setCascata] = useState<Cascata>(CASCATA_VAZIA);
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const completa = cascataCompleta(cascata);
  const sugestao = useProximoCodigo("lps", cascata, aberto && !linha && completa);

  const experts = useListaDe("experts");
  const produtos = useListaDe("produtos", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });
  const funis = useListaDe("funis", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });
  const ofertas = useListaDe("ofertas", { expertId: cascata.expertId }, { enabled: Boolean(cascata.expertId) });

  useEffect(() => {
    setCascata(linha ? { expertId: linha.expertId, productId: linha.productId, funnelId: linha.funnelId, offerId: linha.offerId } : (cascataInicial ?? CASCATA_VAZIA));
    setCode(linha?.code ?? "");
    setUrl(linha?.url ?? "");
    setDescription(linha?.description ?? "");
    setErro(null);
  }, [linha, aberto, cascataInicial, setErro]);

  useEffect(() => {
    if (!linha && sugestao.data?.codigo && !code) setCode(sugestao.data.codigo);
  }, [sugestao.data?.codigo, linha]);

  // Slug ao vivo, com a MESMA função da API (spec § 6: somente leitura, copiável).
  const slug = useMemo(
    () =>
      previaDeSlug({
        expert: experts.data?.find((e) => e.id === cascata.expertId)?.code,
        produto: produtos.data?.find((p) => p.id === cascata.productId)?.slug,
        funil: funis.data?.find((f) => f.id === cascata.funnelId)?.code,
        oferta: ofertas.data?.find((o) => o.id === cascata.offerId)?.code,
        codigo: code,
      }),
    [experts.data, produtos.data, funis.data, ofertas.data, cascata, code],
  );

  async function salvar(eOutra = false) {
    const dados = { code, url: url.trim() || null, description: description.trim() || null };
    if (linha) {
      const ok = await tentar(() => editar.mutateAsync({ id: linha.id, dados }), `LP ${linha.slug} atualizada.`);
      if (ok) onFechar();
      return;
    }
    let criada: Lp | null = null;
    const ok = await tentar(async () => {
      criada = await criar.mutateAsync({ ...cascata, code, url: url.trim() || undefined, description: description.trim() || undefined });
      // Conferência AC13: o slug que a tela mostrou tem que ser o que a API gravou.
      if (slug && criada.slug !== slug) toast.warning(`A API gravou ${criada.slug}, a tela mostrava ${slug}. Avise o dev.`);
    }, criada ? `LP ${(criada as Lp).slug} criada.` : "LP criada.");
    if (!ok) return;
    if (criada && onSalvo) onSalvo(criada);
    if (eOutra) {
      // Mantém expert/produto/funil/oferta e busca a PRÓXIMA letra explicitamente
      // (mesmo motivo do formulário de funil/oferta: o efeito da sugestão não
      // dispara de novo depois que a invalidação já trouxe o valor novo).
      setUrl("");
      setDescription("");
      const proximo = await sugestao.refetch();
      setCode(proximo.data?.codigo ?? "");
      return;
    }
    onFechar();
  }

  return (
    <FormularioDialogo aberto={aberto} onFechar={onFechar} titulo={linha ? `Editar LP ${linha.slug}` : "Nova LP"} descricao="Uma LP pertence a expert + produto + funil + oferta. O slug é gerado e é a identidade pública da página." onSalvar={() => salvar(false)} onSalvarEOutra={linha ? undefined : () => salvar(true)} salvando={criar.isPending || editar.isPending} podeSalvar={completa && Boolean(code.trim())} erro={erro}>
      {/* Um select por linha (validação visual do dono, 2026-09-09): os rótulos de
          funil e oferta são longos e, lado a lado, a lista aberta de um cobria o outro. */}
      <div className="grid gap-3">
        <CascataDeSelects valor={cascata} onChange={(c) => { setCascata(c); setCode(""); }} travado={Boolean(linha)} />
      </div>
      <CampoImutavel id="lpcode" label="Código" valor={code} onChange={setCode} tipo="lp" usadoEm={linha?.usadoEm ?? 0} placeholder="lpa" ajuda={!linha && sugestao.data?.codigo ? `Sugerido: ${sugestao.data.codigo} (próximo livre nesta combinação).` : "lp + uma letra, único na combinação."} />
      <div className="space-y-1">
        <Label>Slug (gerado)</Label>
        <div className="flex items-center gap-2">
          <Input readOnly value={slug ?? ""} placeholder="preencha a combinação e o código" className="font-mono" />
          <Button type="button" variant="outline" size="icon" disabled={!slug} onClick={() => slug && void copiar(slug)} title="Copiar slug">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="url">URL publicada (opcional)</Label>
        <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lpdesc">Descrição (opcional)</Label>
        <Textarea id="lpdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ex.: VSL longa com prova social" />
      </div>
    </FormularioDialogo>
  );
}

// ─────────────────────────── Valor fixo ───────────────────────────
export const ROTULO_DO_TIPO: Record<TipoDeValor, string> = { year: "Ano", temperature: "Temperatura", auction: "Leilão", format: "Formato" };

export function FormValorFixo(props: { aberto: boolean; tipo: TipoDeValor; linha: ValorFixo | null; onFechar: () => void }) {
  const { aberto, tipo, linha, onFechar } = props;
  const criar = useCriar("dicionario");
  const editar = useEditar("dicionario");
  const { erro, setErro, tentar } = useSalvar();
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  useEffect(() => {
    setValue(linha?.value ?? "");
    setDescription(linha?.description ?? "");
    setSortOrder(String(linha?.sortOrder ?? 0));
    setErro(null);
  }, [linha, aberto, setErro]);

  async function salvar() {
    const dados = { value, description: description.trim() || null, sortOrder: Number(sortOrder) || 0 };
    const ok = linha
      ? await tentar(() => editar.mutateAsync({ id: linha.id, dados }), `${ROTULO_DO_TIPO[tipo]} atualizado.`)
      : await tentar(() => criar.mutateAsync({ type: tipo, ...dados, description: description.trim() || undefined }), `${ROTULO_DO_TIPO[tipo]} "${value.toLowerCase()}" criado.`);
    if (ok) onFechar();
  }
  return (
    <FormularioDialogo aberto={aberto} onFechar={onFechar} titulo={linha ? `Editar ${ROTULO_DO_TIPO[tipo].toLowerCase()} ${linha.value}` : `Novo valor em ${ROTULO_DO_TIPO[tipo]}`} onSalvar={salvar} salvando={criar.isPending || editar.isPending} podeSalvar={Boolean(value.trim())} erro={erro}>
      <CampoImutavel id="value" label="Valor" valor={value} onChange={setValue} tipo="valor" usadoEm={linha?.usadoEm ?? 0} placeholder={tipo === "year" ? "2028" : tipo === "format" ? "carrossel" : "mix"} ajuda="Só letras e números. Entra no nome exatamente assim." autoFocus={!linha} />
      <div className="space-y-1">
        <Label htmlFor="vdesc">Descrição (opcional)</Label>
        <Input id="vdesc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ordem">Ordem no select</Label>
        <Input id="ordem" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-[120px]" />
      </div>
    </FormularioDialogo>
  );
}
