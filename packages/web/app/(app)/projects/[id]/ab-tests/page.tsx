"use client";

/**
 * Testes A/B de página.
 *
 * ## O que esta tela promete, e o que ela não promete
 *
 * Ela mede variações que já estão no ar. Não distribui tráfego — quem manda
 * 50/50 para duas URLs é o anúncio, o link do e-mail ou um serviço de split à
 * parte. A distinção está escrita na tela porque é onde todo mundo se confunde:
 * link de split é distribuição, não é o mecanismo de medição.
 *
 * ## Três estados, não um selo
 *
 * "Sem amostra", "inconclusivo" e "vencedor". O do meio é o que falta na
 * maioria das ferramentas e o mais comum na prática — o teste rodou, os números
 * diferem, e ainda não dá para dizer nada. Sem ele a tela mentiria por omissão.
 */

import { use, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Loader2,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useExcluirTesteAB,
  useResultadoAB,
  useMetasDoPlausible,
  useSalvarTesteAB,
  useTestesAB,
  type TesteAB,
} from "@/lib/hooks/use-ab-tests";

const PERIODOS = [
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "6mo", rotulo: "6 meses" },
] as const;

/** Como cada estado se apresenta. O texto é do servidor; aqui é só a cara. */
const CARA_DO_ESTADO = {
  sem_amostra: {
    cor: "text-muted-foreground",
    fundo: "bg-muted/40",
    Icone: AlertCircle,
  },
  inconclusivo: {
    cor: "text-amber-600 dark:text-amber-500",
    fundo: "bg-amber-500/10",
    Icone: AlertCircle,
  },
  vencedor: {
    cor: "text-emerald-600 dark:text-emerald-500",
    fundo: "bg-emerald-500/10",
    Icone: Trophy,
  },
} as const;

const pct = (t: number | null) =>
  t === null ? "—" : `${(t * 100).toFixed(2)}%`;

function Resultado({
  projectId,
  teste,
}: {
  projectId: string;
  teste: TesteAB;
}) {
  const [periodo, setPeriodo] = useState<string>("30d");
  const { data, isLoading, error } = useResultadoAB(
    projectId,
    teste.id,
    periodo,
  );

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Contando visitas no Plausible…
      </p>
    );
  }

  if (error) {
    // O servidor manda a frase pronta ("Escolha a meta de conversão…"), que diz
    // o que fazer. Trocá-la por "erro ao carregar" perderia a instrução.
    return (
      <p className="flex items-start gap-2 p-4 text-sm text-amber-600 dark:text-amber-500">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {error instanceof Error
          ? error.message
          : "Não consegui calcular o resultado."}
      </p>
    );
  }
  if (!data) return null;

  const { cor, fundo, Icone } = CARA_DO_ESTADO[data.estado];

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => setPeriodo(p.valor)}
            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
              periodo === p.valor
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {data.periodo.inicio} → {data.periodo.fim}
        </span>
      </div>

      <div
        className={`flex items-start gap-2 rounded-lg p-3 text-[13px] ${fundo} ${cor}`}
      >
        <Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{data.mensagem}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {["Variação", "Visitas", "Conversões", "Taxa"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.linhas.map((l) => (
              <tr
                key={l.id}
                className="border-b border-border/30 last:border-b-0"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    {l.vencedora && (
                      <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                    {l.nome}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {l.url}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {l.visitas.toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {l.conversoes.toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2 font-medium tabular-nums">
                  {pct(l.taxa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.comparacoes > 1 && (
        <p className="text-[11px] text-muted-foreground">
          {data.comparacoes} comparações — exigência apertada para{" "}
          {(data.alfaEfetivo * 100).toFixed(2)}% (Bonferroni), porque testar
          várias variações a 5% cada elegeria um vencedor inexistente com
          frequência.
        </p>
      )}
    </div>
  );
}

function Novo({
  projectId,
  onPronto,
}: {
  projectId: string;
  onPronto: () => void;
}) {
  const salvar = useSalvarTesteAB(projectId);
  const metas = useMetasDoPlausible(projectId).data?.metas ?? [];
  const [nome, setNome] = useState("");
  const [meta, setMeta] = useState("");
  const [variacoes, setVariacoes] = useState([
    { nome: "A", url: "" },
    { nome: "B", url: "" },
  ]);

  const mudar = (i: number, campo: "nome" | "url", valor: string) =>
    setVariacoes((vs) =>
      vs.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)),
    );

  function criar() {
    const limpas = variacoes.filter((v) => v.nome.trim() && v.url.trim());
    if (!nome.trim() || limpas.length < 2) {
      toast.error("Dê um nome ao teste e preencha ao menos duas variações.");
      return;
    }
    salvar.mutate(
      {
        nome: nome.trim(),
        metaConversao: meta.trim() || null,
        variacoes: limpas,
      },
      {
        onSuccess: () => {
          toast.success("Teste criado");
          onPronto();
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Não consegui criar"),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Nome do teste</Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Headline da página de oferta"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Meta de conversão (Plausible)</Label>
          {/* Lista, não texto livre: o nome precisa bater EXATO com o do
              Plausible, e "Form: Submission" digitado como "Form Submission"
              devolve zero sem erro nenhum. */}
          {metas.length > 0 ? (
            <select
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Escolha a meta…</option>
              {metas.map((m) => (
                <option key={m.nome} value={m.nome}>
                  {m.nome} ({m.conversoes} nos últimos 30 dias)
                </option>
              ))}
            </select>
          ) : (
            <>
              <Input
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                placeholder="Compra"
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Não consegui listar as metas — digite o nome exato do goal
                configurado no Plausible.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[11px]">Variações</Label>
        {variacoes.map((v, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={v.nome}
              onChange={(e) => mudar(i, "nome", e.target.value)}
              placeholder="Nome"
              className="h-8 w-24 shrink-0 text-sm"
            />
            <Input
              value={v.url}
              onChange={(e) => mudar(i, "url", e.target.value)}
              placeholder="/oferta-b"
              className="h-8 flex-1 text-sm"
            />
            {variacoes.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() =>
                  setVariacoes((vs) => vs.filter((_, j) => j !== i))
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {/* O CAMINHO, não a URL: é assim que o Plausible identifica a página, e
            colar o domínio daria zero visitas sem nenhum erro visível. */}
        <p className="text-[10px] text-muted-foreground">
          Use o caminho da página, começando com <code>/</code> — não a URL
          completa.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={() => setVariacoes((vs) => [...vs, { nome: "", url: "" }])}
        >
          <Plus className="h-3 w-3" />
          Mais uma variação
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={criar} disabled={salvar.isPending}>
          {salvar.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Criar teste"
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onPronto}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export default function TestesABPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { data, isLoading } = useTestesAB(projectId);
  const salvar = useSalvarTesteAB(projectId);
  const excluir = useExcluirTesteAB(projectId);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const testes = data?.testes ?? [];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="h-5 w-5 text-primary" />
            Testes A/B
          </h1>
          <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">
            Mede variações que já estão no ar, pelas visitas e conversões do
            Plausible. <strong>Não distribui tráfego</strong> — quem manda 50/50
            para duas URLs é o anúncio ou o link.
          </p>
        </div>
        {!criando && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCriando(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo teste
          </Button>
        )}
      </div>

      {criando && (
        <Novo projectId={projectId} onPronto={() => setCriando(false)} />
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </p>
      ) : testes.length === 0 && !criando ? (
        <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
          <p className="text-sm font-medium">Nenhum teste ainda</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Um teste compara duas ou mais páginas que já recebem tráfego e diz
            se a diferença entre elas é real — ou se ainda é cedo para afirmar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {testes.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-border/60 bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setAberto(aberto === t.id ? null : t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[14px] font-semibold">
                    {t.nome}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t.variacoes.length} variações
                    {t.metaConversao
                      ? ` · meta “${t.metaConversao}”`
                      : " · sem meta definida"}
                  </span>
                </button>

                <select
                  value={t.status}
                  onChange={(e) =>
                    salvar.mutate(
                      { id: t.id, status: e.target.value as TesteAB["status"] },
                      {
                        onError: () =>
                          toast.error("Não consegui mudar o status"),
                      },
                    )
                  }
                  className="h-7 rounded-md border border-border bg-transparent px-1.5 text-[11px] outline-none"
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="ativo">Ativo</option>
                  <option value="encerrado">Encerrado</option>
                </select>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() =>
                    excluir.mutate(t.id, {
                      onSuccess: () => toast.success("Teste apagado"),
                      onError: () => toast.error("Não consegui apagar"),
                    })
                  }
                  aria-label={`Apagar ${t.nome}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {aberto === t.id && <Resultado projectId={projectId} teste={t} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
