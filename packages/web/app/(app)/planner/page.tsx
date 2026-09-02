"use client";

/**
 * Planner de Campanhas — o calendário do time.
 *
 * O layout é o do planner original, medido no CSS dele: barra lateral de 236px
 * com o título do app, as três visões e os meses; topbar de 56px com o mês
 * grande e o subtítulo ao lado; split de `528px | 1fr` com scroll independente
 * em cada coluna. O que muda são os tokens — `bg-card`, `border-border`,
 * `text-muted-foreground` no lugar dos hex fixos, para o tema do app valer aqui.
 *
 * ## As três visões respondem perguntas diferentes
 *
 * - **Cards + calendário**: "o que acontece nesta semana?" — a que trava um
 *   planejamento, e a única que exige todas as campanhas na mesma grade.
 * - **Só cards**: "quando exatamente é a fase X?" — onde se digita.
 * - **Timeline**: "os lançamentos estão espremidos?" — só com o período
 *   inteiro na mesma régua.
 *
 * ## `oculta` não vai para o servidor
 *
 * Esconder uma campanha é preferência de quem está olhando, não decisão sobre o
 * plano. No banco, alguém escondendo uma para conferir outra a esconderia para
 * o time inteiro.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  LayoutGrid,
  PanelLeft,
  Rows3,
  Upload,
} from "lucide-react";
import { AgendasDoGoogle } from "@/components/planner/agendas-do-google";
import { toast } from "sonner";
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

type Passo = { tipo: "editou"; campanha: Campanha } | { tipo: "excluiu"; campanha: Campanha };

/** Rótulo de seção da barra lateral — o `.lbl` do original. */
function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1.5 pb-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
      {children}
    </p>
  );
}

/** Botão de ação da topbar — o `.act` do original. */
function Acao({
  children,
  onClick,
  disabled,
  titulo,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  titulo?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-[11px] py-1.5 text-[12px] font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${
        primary
          ? "border border-foreground bg-foreground text-background hover:opacity-90"
          : "border border-border bg-card text-foreground/80 hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

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
  const [rail, setRail] = useState(true);
  const [googleAberto, setGoogleAberto] = useState(false);

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  const historico = useRef<Passo[]>([]);
  const [temHistorico, setTemHistorico] = useState(false);

  const campanhas = useMemo(() => data?.campanhas ?? [], [data]);
  const visiveis = useMemo(() => campanhas.filter((c) => !ocultas.has(c.id)), [campanhas, ocultas]);
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
      if (c) mudarCampanha(c, { phases: c.phases.map((f) => (f.id === fase.id ? fase : f)) });
    },
    [campanhas, mudarCampanha],
  );

  /**
   * Exclui e oferece a volta no próprio aviso.
   *
   * O Ctrl+Z existe, mas ninguém descobre um atalho no momento em que percebe
   * que apagou a coisa errada. Sem diálogo de confirmação de propósito:
   * confirmar toda exclusão treina a pessoa a clicar "sim" sem ler.
   */
  function excluirCampanha(c: Campanha) {
    anotar({ tipo: "excluiu", campanha: c });
    excluir.mutate(c.id);
    toast.success(`"${c.name}" excluída`, {
      action: {
        label: "Desfazer",
        onClick: () => {
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
    // Volta a campanha inteira: a unidade de edição é a campanha, e desfazer
    // campo a campo daria um estado que nunca existiu.
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

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setRail((v) => !v);
        return;
      }
      if (e.key.toLowerCase() !== "z") return;
      // Dentro de um campo, o desfazer nativo é o que a pessoa espera.
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
    a.download = `planner-campanhas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar(arquivo: File) {
    try {
      const lido = JSON.parse(await arquivo.text()) as { campanhas?: Campanha[] };
      if (!Array.isArray(lido.campanhas)) throw new Error("Arquivo sem lista de campanhas");
      // ADICIONA, não substitui. O original trocava o estado inteiro sem avisar
      // — perder o trabalho de outra pessoa por um clique não vale a
      // conveniência.
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
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
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

  const listaDeCards = (
    <>
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
      <button
        type="button"
        onClick={async () => {
          await criar.mutateAsync({ name: "Nova campanha" });
          setVisao("cards");
        }}
        className="grid min-h-[110px] place-items-center rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card hover:text-foreground"
      >
        + Nova campanha
      </button>
    </>
  );

  return (
    /*
     * As colunas acompanham o `rail`.
     *
     * Com largura fixa em `236px 1fr`, esconder a barra lateral com
     * `display:none` tirava ela do grid — e o `main`, que era o segundo filho,
     * passava a ocupar a PRIMEIRA coluna, espremido em 236px, com o resto da
     * tela vazio. Parecia tela preta, e era o conteúdo comprimido num canto.
     */
    <div
      className={`flex h-full min-h-0 flex-col lg:grid ${
        rail ? "lg:grid-cols-[236px_minmax(0,1fr)]" : "lg:grid-cols-1"
      }`}
    >
      {/* Barra lateral do planner: título, visões, meses e legenda. No celular
          vira faixa horizontal no topo — some-la deixaria a legenda, que é o
          único jeito de ocultar uma campanha, inacessível. */}
      <aside
        className={`flex shrink-0 flex-col overflow-hidden border-b border-border bg-card lg:border-b-0 lg:border-r ${
          rail ? "" : "lg:hidden"
        }`}
      >
        <div className="hidden border-b border-border px-[18px] pb-3.5 pt-[18px] lg:block">
          <h1 className="text-[15px] font-bold leading-tight tracking-[-0.01em]">
            Planner de Campanhas
          </h1>
          <p className="mt-[3px] text-[11px] text-muted-foreground">
            Loyola Digital · {hoje.getFullYear()}
          </p>
        </div>

        <div className="flex flex-1 gap-4 overflow-x-auto px-3 py-3.5 lg:flex-col lg:gap-[18px] lg:overflow-y-auto lg:px-3 lg:pb-5 lg:pt-3.5">
          <section className="flex shrink-0 flex-col gap-1.5">
            <Rotulo>Visão</Rotulo>
            <div className="flex gap-1 lg:flex-col lg:gap-1.5">
              {(
                [
                  ["split", Columns2, "Cards + Calendário"],
                  ["cards", LayoutGrid, "Só cards"],
                  ["timeline", Rows3, "Timeline"],
                ] as const
              ).map(([v, Icone, rotulo]) => (
                <button
                  key={v}
                  type="button"
                  aria-current={visao === v}
                  onClick={() => setVisao(v)}
                  className={`flex shrink-0 items-center gap-[9px] whitespace-nowrap rounded-md px-[9px] py-[7px] text-left text-[13px] transition-colors lg:w-full ${
                    visao === v
                      ? "bg-muted font-semibold text-foreground"
                      : "font-medium text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Icone className="h-3.5 w-3.5 flex-none opacity-75" />
                  {rotulo}
                </button>
              ))}
            </div>
          </section>

          <section className="flex shrink-0 flex-col gap-1.5">
            <Rotulo>Meses</Rotulo>
            <div className="flex gap-1 lg:flex-col lg:gap-1.5">
              {meses.map((m) => {
                const n = visiveis.reduce(
                  (acc, c) => acc + c.phases.filter((f) => cruzaMes(f, m.ano, m.mes)).length,
                  0,
                );
                const atual = m.ano === ano && m.mes === mes && visao === "split";
                return (
                  <button
                    key={`${m.ano}-${m.mes}`}
                    type="button"
                    aria-current={atual}
                    onClick={() => {
                      setAno(m.ano);
                      setMes(m.mes);
                      setVisao("split");
                    }}
                    className={`flex shrink-0 items-center gap-[9px] whitespace-nowrap rounded-md px-[9px] py-[7px] text-left text-[13px] transition-colors lg:w-full ${
                      atual
                        ? "bg-muted font-semibold text-foreground"
                        : "font-medium text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span className="capitalize">{MESES_LONGOS[m.mes - 1]}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {String(m.ano).slice(2)}
                    </span>
                    {/* Zero não aparece: uma coluna de zeros vira ruído e
                        esconde os meses que têm algo. */}
                    {n > 0 && (
                      <span
                        className={`ml-auto font-mono text-[10px] ${
                          atual ? "text-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex shrink-0 flex-col gap-1.5">
            <Rotulo>Campanhas</Rotulo>
            <div className="flex gap-px lg:flex-col">
              {campanhas.map((c) => {
                const oculta = ocultas.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={oculta ? "Mostrar no calendário" : "Ocultar do calendário"}
                    onClick={() =>
                      setOcultas((s) => {
                        const novo = new Set(s);
                        if (novo.has(c.id)) novo.delete(c.id);
                        else novo.add(c.id);
                        return novo;
                      })
                    }
                    className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-[5px] text-left transition-colors hover:bg-muted/60 lg:w-full ${
                      oculta ? "opacity-40" : ""
                    }`}
                  >
                    {/* Oculta vira contorno em vez de sumir: o vazio diz
                        "existe e está escondida", o sumiço não diz nada. */}
                    <span
                      className="h-[9px] w-[9px] flex-none rounded-sm"
                      style={
                        oculta
                          ? { boxShadow: `inset 0 0 0 1.5px ${c.color}` }
                          : { backgroundColor: c.color }
                      }
                    />
                    <span className="truncate text-[12px] leading-tight text-foreground/80">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-14 flex-none items-center gap-3 overflow-x-auto border-b border-border bg-card px-5">
          <button
            type="button"
            onClick={() => setRail((v) => !v)}
            title="Recolher barra lateral (Ctrl+B)"
            className="hidden h-[30px] w-[30px] flex-none place-items-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground lg:grid"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {visao === "split" && (
            <div className="flex flex-none items-center gap-[3px]">
              <Acao
                onClick={() => {
                  setAno(hoje.getFullYear());
                  setMes(hoje.getMonth() + 1);
                }}
              >
                Hoje
              </Acao>
              <button
                type="button"
                onClick={() => irParaMes(-1)}
                aria-label="Mês anterior"
                className="grid h-7 w-7 place-items-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => irParaMes(1)}
                aria-label="Próximo mês"
                className="grid h-7 w-7 place-items-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Título e subtítulo na mesma linha: o subtítulo é complemento do
              título, e empilhado vira um segundo assunto. */}
          <h2 className="flex-none whitespace-nowrap text-base font-semibold tracking-[-0.01em] capitalize">
            {visao === "split"
              ? `${MESES_LONGOS[mes - 1]} de ${ano}`
              : visao === "cards"
                ? "Cards"
                : "Timeline"}
          </h2>
          <span className="ml-0.5 flex-none whitespace-nowrap text-[12px] text-muted-foreground">
            {subtitulo}
          </span>

          <div className="flex-1" />

          <div className="flex flex-none items-center gap-1.5">
            {visao === "split" && (
              <Acao onClick={() => setMostrarCards((v) => !v)}>
                {mostrarCards ? "Ocultar cards" : "Mostrar cards"}
              </Acao>
            )}
            <Acao onClick={desfazer} disabled={!temHistorico} titulo="Ctrl+Z">
              Desfazer
            </Acao>
            <Acao onClick={() => setGoogleAberto(true)} titulo="Importar da agenda do Google">
              <CalendarDays className="h-3.5 w-3.5" />
              Google
            </Acao>
            <Acao onClick={exportar}>
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Acao>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-[11px] py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              Importar
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
            <Acao
              primary
              onClick={async () => {
                await criar.mutateAsync({ name: "Nova campanha" });
                setVisao("cards");
              }}
            >
              + Campanha
            </Acao>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-64 rounded-[10px]" />
            <Skeleton className="h-32 rounded-[10px]" />
          </div>
        ) : campanhas.length === 0 ? (
          <div className="px-5 py-[52px] text-center text-[13px] text-muted-foreground">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-60" />
            Nenhuma campanha ainda — crie a primeira, ela já vem com as cinco fases padrão.
          </div>
        ) : visao === "timeline" ? (
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-6 pt-4">
            <Timeline
              campanhas={visiveis}
              faseSelecionada={selecionada}
              onSelecionarFase={(_c, f) => setSelecionada(f)}
              onMudarFase={mudarFase}
            />
          </div>
        ) : visao === "cards" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid items-start gap-4 p-5 [grid-template-columns:repeat(auto-fill,minmax(500px,1fr))] max-[560px]:[grid-template-columns:1fr]">
              {listaDeCards}
            </div>
          </div>
        ) : (
          /* Split: duas colunas com scroll INDEPENDENTE. Uma rolagem só faria
             a lista de cards arrastar o calendário junto, e a graça da visão é
             comparar os dois. */
          <div
            className={`min-h-0 flex-1 lg:grid lg:overflow-hidden ${
              mostrarCards ? "lg:grid-cols-[528px_minmax(0,1fr)]" : "lg:grid-cols-1"
            }`}
          >
            {mostrarCards && (
              <div className="order-2 min-w-0 space-y-3.5 bg-background p-3.5 lg:order-1 lg:overflow-y-auto lg:border-r lg:border-border">
                {listaDeCards}
              </div>
            )}
            <div className="order-1 min-w-0 bg-card lg:order-2 lg:overflow-auto">
              <Calendario
                campanhas={visiveis}
                ano={ano}
                mes={mes}
                faseSelecionada={selecionada}
                onSelecionarFase={(campanhaId, faseId) => {
                  setSelecionada(faseId);
                  // Leva o card à vista: clicar numa barra e não achar onde
                  // editá-la é o atrito que a visão dividida existe para tirar.
                  document
                    .querySelector(`#campanha-${campanhaId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }}
                onMudarFase={mudarFase}
              />
            </div>
          </div>
        )}
      </main>

      <AgendasDoGoogle open={googleAberto} onOpenChange={setGoogleAberto} />
    </div>
  );
}
