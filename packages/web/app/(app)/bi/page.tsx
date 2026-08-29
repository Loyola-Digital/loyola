"use client";

/**
 * O construtor de BI.
 *
 * Uma tela com três partes: a lista de dashboards, o canvas do que está aberto e
 * a galeria de widgets prontos. A ordem importa — o dossiê é explícito em
 * começar pelos presets, porque tela em branco com editor de consulta é
 * inutilizável e catálogo nomeado é usável no dia um.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Globe,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Building2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { BarraDeFiltros } from "@/components/bi/barra-de-filtros";
import { BiCanvas } from "@/components/bi/bi-canvas";
import { EditorDeWidget } from "@/components/bi/editor-de-widget";
import { GaleriaDeWidgets } from "@/components/bi/galeria-de-widgets";
import { WidgetConteudo } from "@/components/bi/widget-conteudo";
import { useProjects } from "@/lib/hooks/use-projects";
import { useRefreshProgressivo } from "@/lib/hooks/use-refresh-progressivo";
import { useSalvamentoSerializado } from "@/lib/hooks/use-salvamento-serializado";
import {
  useApagarDashboard,
  useCatalogoDeBi,
  useCriarDashboard,
  useDashboard,
  useDashboards,
  useDuplicarDashboard,
  useInserirWidget,
  usePresetsDeBi,
  useRemoverWidget,
  useSalvarDashboard,
  type PresetNaGaleria,
  type ResultadoDoWidget,
} from "@/lib/hooks/use-bi";
import type { DateRange, Widget } from "@/lib/bi/tipos";
import { cn } from "@/lib/utils";

const PROJETO_LEMBRADO = "bi:projeto";

export default function BiPage() {
  const { data: projetos, isLoading: carregandoProjetos } = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [organizando, setOrganizando] = useState(false);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const [aApagar, setAApagar] = useState<string | null>(null);
  const [inserindo, setInserindo] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<Widget | null>(null);
  /** `true` enquanto o widget aberto ainda não existe no servidor. */
  const [editandoNovo, setEditandoNovo] = useState(false);

  // Widgets locais: o canvas mexe neles a cada arrasto, e o servidor recebe
  // depois, pela fila. Sem essa cópia, o card voltaria para a posição antiga a
  // cada resposta da API.
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [recemInseridos, setRecemInseridos] = useState<Record<string, ResultadoDoWidget>>({});

  useEffect(() => {
    if (projectId || !projetos?.length) return;
    const lembrado = typeof window === "undefined" ? null : localStorage.getItem(PROJETO_LEMBRADO);
    setProjectId(lembrado && projetos.some((p) => p.id === lembrado) ? lembrado : projetos[0]!.id);
  }, [projetos, projectId]);

  const { data: lista, isLoading: carregandoLista } = useDashboards(projectId);
  const { data: dashboard } = useDashboard(projectId, dashboardId);
  const { data: presets } = usePresetsDeBi();
  const { data: catalogo } = useCatalogoDeBi();

  // A atualização é progressiva: cada widget pinta quando a linha dele chega,
  // em vez de a tela inteira esperar a consulta mais lenta.
  const {
    resultados: calculados,
    carregando: calculando,
    pendentes,
    periodo: periodoEmVigor,
    projetosNoEscopo,
    pedir,
    atualizarAgora,
  } = useRefreshProgressivo(projectId, dashboardId);

  const criar = useCriarDashboard(projectId);
  const duplicar = useDuplicarDashboard(projectId);
  const apagar = useApagarDashboard(projectId);
  const salvar = useSalvarDashboard(projectId, dashboardId);
  const inserir = useInserirWidget(projectId, dashboardId);
  const remover = useRemoverWidget(projectId, dashboardId);

  useEffect(() => {
    if (dashboard) setWidgets(dashboard.widgets);
  }, [dashboard]);

  useEffect(() => {
    if (!dashboardId && lista?.dashboards.length) setDashboardId(lista.dashboards[0]!.id);
  }, [lista, dashboardId]);

  // O salvamento de geometria passa pela fila: debounce, um PUT por vez e
  // descarga ao sair. Só `widgets` vai no corpo — patch parcial.
  const salvarWidgets = useCallback(
    async (lista: Widget[]) => salvar.mutateAsync({ widgets: lista }),
    [salvar],
  );
  const { agendar, salvando } = useSalvamentoSerializado(salvarWidgets);

  const aoMudarGeometria = useCallback(
    (novos: Widget[]) => {
      setWidgets(novos);
      agendar(novos);
    },
    [agendar],
  );

  const resultados = useMemo(
    () => ({ ...calculados, ...recemInseridos }),
    [calculados, recemInseridos],
  );

  // Trocar o filtro salva (é estado do dashboard) e pede a leva nova — o
  // debounce e o aborto da leva anterior ficam com o controle de levas.
  function aplicarPeriodo(novo: DateRange) {
    salvar.mutate({ dateRange: novo });
    pedir({ dateRange: novo, slicers: dashboard?.slicers ?? [] });
  }

  function aplicarSlicers(novos: { field: string; values: string[] }[]) {
    salvar.mutate({ slicers: novos });
    pedir({ dateRange: dashboard?.dateRange, slicers: novos });
  }

  /**
   * Alterna entre um projeto e todos.
   *
   * `atualizarAgora` em vez de `pedir`: trocar o escopo muda o significado de
   * todo número da tela, e esperar 500 ms deixaria o painel mostrando o recorte
   * antigo com o rótulo novo.
   */
  async function alternarEscopo() {
    if (!dashboard) return;
    const novo = dashboard.escopo === "todos" ? "projeto" : "todos";
    await salvar.mutateAsync({ escopo: novo });
    void atualizarAgora({});
  }

  async function inserirPreset(preset: PresetNaGaleria) {
    if (!dashboardId) return;
    setInserindo(preset.id);
    try {
      const { widget, resultado } = await inserir.mutateAsync({ presetId: preset.id });
      setWidgets((atuais) => [...atuais, widget]);
      // O resultado veio junto com a inserção: o card nasce preenchido, sem
      // um segundo request nem um instante em branco.
      setRecemInseridos((atuais) => ({ ...atuais, [widget.id]: resultado }));
    } finally {
      // No `finally` de propósito: erro na inserção não pode deixar a galeria
      // travada em "inserindo".
      setInserindo(null);
    }
  }

  /** O widget em branco com que o editor começa. */
  function widgetVazio(): Widget {
    return {
      id: "novo",
      tipo: "kpi",
      titulo: "Novo widget",
      spec: {
        entity: "trafego",
        metrics: ["trafego.spend"],
        dimensions: [],
        // O período é injetado pelo dashboard; este é só o valor inicial.
        filters: {
          "trafego.date": {
            operator: "$between",
            value: [
              periodoEmVigor?.start ?? dashboard?.periodo.start ?? "",
              periodoEmVigor?.end ?? dashboard?.periodo.end ?? "",
            ],
          },
        },
        order_by: [],
        limit: 500,
        date_granularity: "day",
      },
      specsExtras: [],
      derivadas: [],
      geometria: { x: 0, y: 0, w: 3, h: 2 },
      opcoes: {},
    };
  }

  async function salvarWidgetEditado(editado: Widget) {
    if (editandoNovo) {
      // O id vem do servidor: o `"novo"` do rascunho é só um marcador de tela.
      const semId: Omit<Widget, "id"> = {
        tipo: editado.tipo,
        titulo: editado.titulo,
        spec: editado.spec,
        specsExtras: editado.specsExtras,
        derivadas: editado.derivadas,
        mergeKey: editado.mergeKey,
        geometria: editado.geometria,
        opcoes: editado.opcoes,
      };
      const { widget, resultado } = await inserir.mutateAsync({ widget: semId });
      setWidgets((atuais) => [...atuais, widget]);
      setRecemInseridos((atuais) => ({ ...atuais, [widget.id]: resultado }));
    } else {
      const novos = widgets.map((w) => (w.id === editado.id ? editado : w));
      setWidgets(novos);
      await salvar.mutateAsync({ widgets: novos });
      // A definição mudou: o resultado guardado é de outra pergunta.
      setRecemInseridos((atuais) => {
        const copia = { ...atuais };
        delete copia[editado.id];
        return copia;
      });
      void atualizarAgora({});
    }
    setEmEdicao(null);
    setEditandoNovo(false);
  }

  async function removerWidget(id: string) {
    setWidgets((atuais) => atuais.filter((w) => w.id !== id));
    try {
      await remover.mutateAsync(id);
    } catch {
      // Falhou no servidor: devolve o card, senão a tela mente sobre o que foi
      // apagado.
      if (dashboard) setWidgets(dashboard.widgets);
    }
  }

  const dashboards = lista?.dashboards ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-5" />
          <h1 className="text-lg font-semibold">BI</h1>
        </div>

        <Select
          value={projectId ?? undefined}
          onValueChange={(v) => {
            setProjectId(v);
            setDashboardId(null);
            localStorage.setItem(PROJETO_LEMBRADO, v);
          }}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder={carregandoProjetos ? "Carregando…" : "Projeto"} />
          </SelectTrigger>
          <SelectContent>
            {(projetos ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dashboards.length > 0 && (
          <Select value={dashboardId ?? undefined} onValueChange={setDashboardId}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Dashboard" />
            </SelectTrigger>
            <SelectContent>
              {dashboards.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {salvando && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> salvando
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => atualizarAgora({})}
            disabled={!dashboardId || calculando}
          >
            <RefreshCw className={cn("size-3.5", calculando && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            variant={organizando ? "default" : "outline"}
            size="sm"
            onClick={() => setOrganizando((v) => !v)}
            disabled={!dashboardId}
          >
            <Settings2 className="size-3.5" />
            {organizando ? "Concluir" : "Organizar"}
          </Button>
          <Button
            size="sm"
            onClick={() => setGaleriaAberta((v) => !v)}
            disabled={!dashboardId}
          >
            <Plus className="size-3.5" />
            Widget
          </Button>
        </div>
      </header>

      {dashboardId && dashboard && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={dashboard.nome}
            onChange={(e) => salvar.mutate({ nome: e.target.value })}
            className="h-8 w-[260px] text-sm"
          />
          <Button
            variant={dashboard.escopo === "todos" ? "secondary" : "outline"}
            size="sm"
            onClick={alternarEscopo}
            title={
              dashboard.escopo === "todos"
                ? "Somando todos os projetos que você enxerga"
                : `Somando só os funis de ${projetos?.find((p) => p.id === projectId)?.name ?? "este projeto"}`
            }
          >
            {dashboard.escopo === "todos" ? (
              <Globe className="size-3.5" />
            ) : (
              <Building2 className="size-3.5" />
            )}
            {dashboard.escopo === "todos"
              ? `Todos os projetos${projetosNoEscopo > 1 ? ` (${projetosNoEscopo})` : ""}`
              : "Este projeto"}
          </Button>

          {pendentes > 0 && (
            <span className="text-xs text-muted-foreground">
              carregando {pendentes} widget(s)…
            </span>
          )}
          {dashboard.widgetsIlegiveis > 0 && (
            <span className="text-xs text-amber-600">
              {dashboard.widgetsIlegiveis} widget(s) salvos num formato antigo não abrem
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => duplicar.mutate(dashboard.id)}>
              <Copy className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAApagar(dashboard.id)}>
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      )}

      {dashboardId && dashboard && (
        <BarraDeFiltros
          projectId={dashboard.projectId}
          dateRange={dashboard.dateRange}
          periodo={periodoEmVigor ?? dashboard.periodo}
          slicers={dashboard.slicers}
          onDateRange={aplicarPeriodo}
          onSlicers={aplicarSlicers}
        />
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <main className="min-w-0 flex-1 overflow-auto">
          {carregandoLista && <Skeleton className="h-64 w-full" />}

          {!carregandoLista && dashboards.length === 0 && (
            <VazioSemDashboard onCriar={(nome) => criar.mutate(nome)} criando={criar.isPending} />
          )}

          {dashboardId && (
            <BiCanvas
              widgets={widgets}
              onGeometriaMudou={aoMudarGeometria}
              layoutTravado={!organizando}
              renderWidget={(w) => (
                <WidgetConteudo
                  widget={w}
                  resultado={resultados[w.id]}
                  carregando={calculando && !resultados[w.id]}
                />
              )}
              renderAcoes={(w) =>
                organizando ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0"
                      onClick={() => {
                        setEditandoNovo(false);
                        setEmEdicao(w);
                      }}
                      aria-label={`Editar ${w.titulo}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0"
                      onClick={() => removerWidget(w.id)}
                      aria-label={`Remover ${w.titulo}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                ) : null
              }
              vazio={
                <div className="rounded-xl border border-dashed p-10 text-center">
                  <p className="text-sm font-medium">Dashboard vazio</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Abra a galeria e escolha um widget pronto — não precisa montar consulta.
                  </p>
                  <Button className="mt-4" size="sm" onClick={() => setGaleriaAberta(true)}>
                    <Plus className="size-3.5" />
                    Adicionar widget
                  </Button>
                </div>
              }
            />
          )}
        </main>

        {galeriaAberta && dashboardId && (
          <aside className="flex w-[320px] shrink-0 flex-col rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Widgets prontos</h3>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => setGaleriaAberta(false)}
                aria-label="Fechar galeria"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <GaleriaDeWidgets
              presets={presets?.presets ?? []}
              onInserir={inserirPreset}
              inserindo={inserindo}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                setEditandoNovo(true);
                setEmEdicao(widgetVazio());
              }}
            >
              <Plus className="size-3.5" />
              Montar do zero
            </Button>
          </aside>
        )}
      </div>

      <EditorDeWidget
        aberto={Boolean(emEdicao)}
        widget={emEdicao}
        catalogo={catalogo ?? { metrics: [], dimensions: [] }}
        periodo={periodoEmVigor ?? dashboard?.periodo ?? { start: "", end: "" }}
        onFechar={() => {
          setEmEdicao(null);
          setEditandoNovo(false);
        }}
        onSalvar={salvarWidgetEditado}
      />

      <AlertDialog open={Boolean(aApagar)} onOpenChange={(aberto) => !aberto && setAApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              Os widgets e o layout somem junto, e não há lixeira. Os dados em si não são afetados —
              o dashboard só guarda a definição.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aApagar) apagar.mutate(aApagar);
                setDashboardId(null);
                setAApagar(null);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VazioSemDashboard({
  onCriar,
  criando,
}: {
  onCriar: (nome: string) => void;
  criando: boolean;
}) {
  const [nome, setNome] = useState("Visão geral");
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed p-10 text-center">
      <LayoutDashboard className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">Nenhum dashboard neste projeto</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Crie um e monte com widgets prontos — investimento por dia, top criativos, receita por
        produto.
      </p>
      <div className="mt-4 flex gap-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9" />
        <Button size="sm" onClick={() => onCriar(nome)} disabled={criando || !nome.trim()}>
          {criando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Criar
        </Button>
      </div>
    </div>
  );
}
