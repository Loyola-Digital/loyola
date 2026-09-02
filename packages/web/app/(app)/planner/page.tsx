"use client";

/**
 * Planner de Campanhas — o calendário do time.
 *
 * ## As três visões respondem perguntas diferentes
 *
 * - **Cards + calendário** (padrão): "o que acontece nesta semana?" — a
 *   pergunta que trava um planejamento, e a única que exige ver todas as
 *   campanhas na mesma grade.
 * - **Cards**: "quando exatamente é a fase X?" — onde se digita.
 * - **Timeline**: "os lançamentos estão espremidos?" — só aparece com o
 *   período inteiro na mesma régua.
 *
 * ## `oculta` não vai para o servidor
 *
 * Esconder uma campanha é preferência de quem está olhando, não decisão sobre o
 * plano. Se fosse ao banco, alguém escondendo uma campanha para conferir outra
 * a esconderia para o time inteiro.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  LayoutGrid,
  Plus,
  Rows3,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useAtualizarCampanha,
  useCriarCampanha,
  useDuplicarCampanha,
  useExcluirCampanha,
  usePlanner,
  useRestaurarCampanha,
} from "@/lib/hooks/use-planner";
import {
  MESES_LONGOS,
  cruzaMes,
  mesesDoPeriodo,
  normalizar,
  type Campanha,
  type Fase,
} from "@/lib/planner/datas";
import { CardDeCampanha } from "@/components/planner/cards-de-campanha";
import { Calendario } from "@/components/planner/calendario";
import { Timeline } from "@/components/planner/timeline";

type Visao = "split" | "cards" | "timeline";

/** O que o desfazer guarda. Uma ação por entrada, no máximo 30. */
type Passo =
  | { tipo: "editou"; campanha: Campanha }
  | { tipo: "excluiu"; campanha: Campanha };

export default function PlannerPage() {
  const role = useUserRole();
  const { data, isLoading } = usePlanner();
  const criar = useCriarCampanha();
  const atualizar = useAtualizarCampanha();
  const duplicar = useDuplicarCampanha();
  const excluir = useExcluirCampanha();
  const restaurar = useRestaurarCampanha();

  const [visao, setVisao] = useState<Visao>("split");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mostrarCards, setMostrarCards] = useState(true);

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  const historico = useRef<Passo[]>([]);
  const [temHistorico, setTemHistorico] = useState(false);

  const campanhas = useMemo(() => data?.campanhas ?? [], [data]);
  const visiveis = useMemo(
    () => campanhas.filter((c) => !ocultas.has(c.id)),
    [campanhas, ocultas],
  );
  const meses = useMemo(() => mesesDoPeriodo(campanhas), [campanhas]);

  const anotar = useCallback((passo: Passo) => {
    historico.current = [...historico.current, passo].slice(-30);
    setTemHistorico(true);
  }, []);

  const mudarCampanha = useCallback(
    (campanha: Campanha, dados: { name?: string; color?: string; phases?: Fase[] }) => {
      anotar({ tipo: "editou", campanha });
      atualizar.mutate({
        id: campanha.id,
        // Normaliza aqui também: o servidor faria de qualquer jeito, mas o
        // otimista precisa mostrar o valor CORRIGIDO, não o digitado.
        dados: dados.phases ? { ...dados, phases: dados.phases.map(normalizar) } : dados,
      });
    },
    [anotar, atualizar],
  );

  const mudarFase = useCallback(
    (campanhaId: string, fase: Fase) => {
      const c = campanhas.find((x) => x.id === campanhaId);
      if (!c) return;
      mudarCampanha(c, { phases: c.phases.map((f) => (f.id === fase.id ? fase : f)) });
    },
    [campanhas, mudarCampanha],
  );

  /**
   * Exclui, e oferece a volta no próprio aviso.
   *
   * O Ctrl+Z existe, mas ninguém descobre um atalho no momento em que percebe
   * que apagou a coisa errada. O botão no toast é a mesma ação ao alcance da
   * mão que já está no mouse.
   *
   * Sem diálogo de confirmação de propósito: confirmar toda exclusão treina a
   * pessoa a clicar "sim" sem ler, e aí a proteção deixa de proteger. Poder
   * voltar atrás vale mais que ter de pedir licença.
   */
  function excluirCampanha(c: Campanha) {
    anotar({ tipo: "excluiu", campanha: c });
    excluir.mutate(c.id);
    toast.success(`"${c.name}" excluída`, {
      action: {
        label: "Desfazer",
        onClick: () => {
          // Tira do histórico: desfazer pelo botão e depois pelo Ctrl+Z
          // recriaria a campanha duas vezes.
          historico.current = historico.current.filter(
            (x) => !(x.tipo === "excluiu" && x.campanha.id === c.id),
          );
          setTemHistorico(historico.current.length > 0);
          void restaurar.mutateAsync(c).then(() => toast.success(`"${c.name}" restaurada`));
        },
      },
    });
  }

  async function desfazer() {
    const passo = historico.current.pop();
    setTemHistorico(historico.current.length > 0);
    if (!passo) return;

    if (passo.tipo === "excluiu") {
      await restaurar.mutateAsync(passo.campanha);
      toast.success(`"${passo.campanha.name}" restaurada`);
      return;
    }
    // Editar volta a campanha inteira ao que era: a unidade de edição é a
    // campanha, então desfazer campo a campo daria um estado que nunca existiu.
    await atualizar.mutateAsync({
      id: passo.campanha.id,
      dados: {
        name: passo.campanha.name,
        color: passo.campanha.color,
        phases: passo.campanha.phases,
      },
    });
    toast.success("Desfeito");
  }

  // Ctrl+Z em qualquer lugar da tela, menos dentro de um campo de texto — ali
  // o desfazer nativo do input é o que a pessoa espera.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.matches?.("input, textarea")) return;
      e.preventDefault();
      void desfazer();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  function exportar() {
    const blob = new Blob([JSON.stringify({ campanhas }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar(arquivo: File) {
    try {
      const texto = await arquivo.text();
      const lido = JSON.parse(texto) as { campanhas?: Campanha[] };
      if (!Array.isArray(lido.campanhas)) throw new Error("Arquivo sem lista de campanhas");

      // ADICIONA, não substitui. O planner original trocava o estado inteiro
      // sem avisar — aqui perder o trabalho de outra pessoa por um clique não
      // é um risco que valha a conveniência.
      for (const c of lido.campanhas) {
        await criar.mutateAsync({ name: c.name, color: c.color, phases: c.phases });
      }
      toast.success(`${lido.campanhas.length} campanha(s) adicionada(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ler o arquivo");
    }
  }

  function irParaMes(passo: number) {
    let m = mes + passo;
    let a = ano;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAno(a);
  }

  if (role === "guest") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">O Planner é restrito à equipe interna.</p>
        </div>
      </div>
    );
  }

  const fasesNoMes = visiveis.reduce(
    (acc, c) => acc + c.phases.filter((f) => cruzaMes(f, ano, mes)).length,
    0,
  );

  const subtitulo =
    visao === "split"
      ? `${fasesNoMes} ${fasesNoMes === 1 ? "fase no mês" : "fases no mês"}`
      : visao === "cards"
        ? `${campanhas.length} ${campanhas.length === 1 ? "campanha" : "campanhas"}`
        : "arraste as barras para reprogramar";

  return (
    /*
     * Sem altura fixa.
     *
     * `h-[calc(100vh-3.5rem)]` funciona no desktop e falha no celular: ali o
     * `100vh` conta a barra do navegador, que aparece e some conforme a rolagem
     * — o container muda de altura sozinho e corta o conteudo. As outras telas
     * do app usam `h-full` com scroll do pai, e esta passa a fazer igual.
     */
    <div className="flex h-full flex-col">
      {/* Rola de lado em vez de quebrar em quatro linhas: num celular, um
          cabecalho de 160px de altura come metade da tela util. */}
      <header className="flex items-center gap-2 overflow-x-auto border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-0.5">
          {(
            [
              ["split", Columns2, "Cards + calendário"],
              ["cards", LayoutGrid, "Só cards"],
              ["timeline", Rows3, "Timeline"],
            ] as const
          ).map(([v, Icone, titulo]) => (
            <button
              key={v}
              type="button"
              title={titulo}
              onClick={() => setVisao(v)}
              className={`rounded px-2 py-1 transition-colors ${
                visao === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icone className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {visao === "split" && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setAno(hoje.getFullYear());
                setMes(hoje.getMonth() + 1);
              }}
            >
              Hoje
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => irParaMes(-1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => irParaMes(1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {visao === "split" ? `${MESES_LONGOS[mes - 1]} de ${ano}` : visao === "cards" ? "Cards" : "Timeline"}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">{subtitulo}</p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {visao === "split" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setMostrarCards((v) => !v)}
            >
              {mostrarCards ? "Ocultar cards" : "Mostrar cards"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Desfazer (Ctrl+Z)"
            disabled={!temHistorico}
            onClick={desfazer}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Exportar" onClick={exportar}>
            <Download className="h-3.5 w-3.5" />
          </Button>

          <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Importar">
            <Upload className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importar(f);
                e.target.value = "";
              }}
            />
          </label>

          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={async () => {
              await criar.mutateAsync({ name: "Nova campanha" });
              setVisao("cards");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Campanha
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* No celular vira faixa horizontal em vez de sumir: sem ela, os meses
            e a legenda de campanhas ficariam inacessiveis, e a legenda e o
            unico jeito de ocultar uma campanha. */}
        <aside className="w-full shrink-0 overflow-x-auto border-b border-border/50 p-3 lg:w-52 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Meses</p>
          <div className="mb-4 flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {meses.map((m) => {
              const n = visiveis.reduce(
                (acc, c) => acc + c.phases.filter((f) => cruzaMes(f, m.ano, m.mes)).length,
                0,
              );
              const atual = m.ano === ano && m.mes === mes;
              return (
                <button
                  key={`${m.ano}-${m.mes}`}
                  type="button"
                  onClick={() => {
                    setAno(m.ano);
                    setMes(m.mes);
                    setVisao("split");
                  }}
                  className={`flex shrink-0 items-center justify-between gap-1 rounded px-1.5 py-1 text-[11px] transition-colors lg:w-full ${
                    atual ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span>
                    {MESES_LONGOS[m.mes - 1]?.slice(0, 3).toLowerCase()} {String(m.ano).slice(2)}
                  </span>
                  {/* Sem fase não mostra zero: uma coluna de zeros vira ruído
                      e esconde os meses que têm algo. */}
                  {n > 0 && <span className="tabular-nums text-muted-foreground">{n}</span>}
                </button>
              );
            })}
          </div>

          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Campanhas
          </p>
          <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {campanhas.map((c) => {
              const oculta = ocultas.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  title={oculta ? "Mostrar" : "Ocultar"}
                  onClick={() =>
                    setOcultas((s) => {
                      const novo = new Set(s);
                      if (novo.has(c.id)) novo.delete(c.id);
                      else novo.add(c.id);
                      return novo;
                    })
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-opacity hover:bg-muted lg:w-full ${
                    oculta ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          ) : campanhas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Nenhuma campanha ainda.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie a primeira — ela já vem com as cinco fases padrão.
              </p>
            </div>
          ) : visao === "timeline" ? (
            <Timeline
              campanhas={visiveis}
              faseSelecionada={selecionada}
              onSelecionarFase={(_c, f) => setSelecionada(f)}
              onMudarFase={mudarFase}
            />
          ) : visao === "cards" ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {campanhas.map((c) => (
                <CardDeCampanha
                  key={c.id}
                  campanha={c}
                  faseSelecionada={selecionada}
                  onMudar={(dados) => mudarCampanha(c, dados)}
                  onExcluir={() => excluirCampanha(c)}
                  onDuplicar={() => duplicar.mutate(c.id)}
                  onSelecionarFase={setSelecionada}
                />
              ))}
            </div>
          ) : (
            <div className={`grid gap-4 ${mostrarCards ? "xl:grid-cols-[480px_1fr]" : ""}`}>
              {mostrarCards && (
                // `order-2` no celular: o calendario e a visao principal desta
                // tela, e os cards empilhados em cima empurrariam ele para
                // fora do primeiro rolar.
                <div className="order-2 space-y-3 xl:order-1 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto xl:pr-1">
                  {campanhas.map((c) => (
                    <CardDeCampanha
                      key={c.id}
                      campanha={c}
                      faseSelecionada={selecionada}
                      onMudar={(dados) => mudarCampanha(c, dados)}
                      onExcluir={() => excluirCampanha(c)}
                      onDuplicar={() => duplicar.mutate(c.id)}
                      onSelecionarFase={setSelecionada}
                    />
                  ))}
                </div>
              )}

              <div className="order-1 min-w-0 xl:order-2">
              <Calendario
                campanhas={visiveis}
                ano={ano}
                mes={mes}
                faseSelecionada={selecionada}
                onSelecionarFase={(_c, f) => {
                  setSelecionada(f);
                  // Leva o card correspondente à vista: clicar numa barra e não
                  // achar onde editá-la é o atrito que a visão dividida existe
                  // para eliminar.
                  document
                    .querySelector(`#campanha-${_c}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }}
                onMudarFase={mudarFase}
              />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
