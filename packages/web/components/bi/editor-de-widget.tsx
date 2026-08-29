"use client";

/**
 * O editor de widget.
 *
 * Depois dos presets, é aqui que se monta uma pergunta que ninguém previu. As
 * regras difíceis (cascata ao trocar métrica, operadores por tipo, frase
 * descritiva) moram em `lib/bi/edicao.ts` e são testadas lá — este arquivo é o
 * formulário.
 *
 * Duas escolhas que não são cosméticas: os pickers são **agrupados** (uma lista
 * plana de quarenta campos não é escolhível) e campo travado mostra o **motivo**,
 * nunca só cinza.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Lock, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ROTULO_DO_OPERADOR,
  adicionarMetricaDeOutraEntidade,
  aridade,
  atualizarDimensoes,
  atualizarMetricas,
  descrever,
  dimensoesAgrupadas,
  metricasAgrupadas,
  operadoresPara,
  podeEditarDimensoes,
  podeEditarMetricas,
  removerConsultaExtra,
  tipoSugerido,
} from "@/lib/bi/edicao";
import { TIPOS_COM_ROTULO } from "@/lib/bi/rotulos";
import type {
  CampoDoCatalogo,
  Derivada,
  Filtro,
  Operador,
  TipoDeWidget,
  Widget,
} from "@/lib/bi/tipos";

export function EditorDeWidget({
  aberto,
  widget,
  catalogo,
  periodo,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  widget: Widget | null;
  catalogo: { metrics: CampoDoCatalogo[]; dimensions: CampoDoCatalogo[] };
  periodo: { start: string; end: string };
  onFechar: () => void;
  onSalvar: (widget: Widget) => void;
}) {
  const [rascunho, setRascunho] = useState<Widget | null>(widget);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [sujo, setSujo] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [buscaMetrica, setBuscaMetrica] = useState("");
  const [buscaDimensao, setBuscaDimensao] = useState("");

  useEffect(() => {
    setRascunho(widget);
    setAvisos([]);
    setSujo(false);
  }, [widget]);

  const daEntidade = useMemo(() => {
    const e = rascunho?.spec.entity;
    return {
      metrics: catalogo.metrics.filter((c) => c.entity === e),
      dimensions: catalogo.dimensions.filter((c) => c.entity === e),
    };
  }, [catalogo, rascunho?.spec.entity]);

  /**
   * As métricas de OUTRAS entidades, para o auto-split.
   *
   * Só as que têm chance de casar: se a consulta base agrupa por data, a outra
   * entidade precisa ter data também — senão a segunda consulta viraria um total
   * solto que não se encaixa em linha nenhuma.
   */
  const deOutrasEntidades = useMemo(() => {
    const e = rascunho?.spec.entity;
    if (!e) return [];
    const busca = buscaMetrica.trim().toLowerCase();
    return catalogo.metrics
      .filter((c) => c.entity !== e)
      .filter((c) => !busca || c.label.toLowerCase().includes(busca));
  }, [catalogo.metrics, rascunho?.spec.entity, buscaMetrica]);

  const rotulo = useMemo(() => {
    const mapa = new Map(
      [...catalogo.metrics, ...catalogo.dimensions].map((c) => [c.key, c.label] as const),
    );
    return (k: string) => mapa.get(k) ?? k;
  }, [catalogo]);

  if (!rascunho) return null;

  const metricasLivres = podeEditarMetricas(rascunho);
  const dimensoesLivres = podeEditarDimensoes(rascunho);
  const frase = descrever(rascunho.spec, rotulo, periodo);

  function mexer(fn: (w: Widget) => { widget: Widget; avisos: string[] }) {
    setRascunho((atual) => {
      if (!atual) return atual;
      const r = fn(atual);
      setAvisos(r.avisos);
      setSujo(true);
      return r.widget;
    });
  }

  function alternarMetrica(key: string) {
    if (!metricasLivres.pode) return;
    const atuais = rascunho!.spec.metrics;
    const novas = atuais.includes(key) ? atuais.filter((m) => m !== key) : [...atuais, key];
    if (novas.length === 0) return; // Widget sem métrica não mostra nada.
    mexer((w) => atualizarMetricas(w, novas));
  }

  function alternarDimensao(key: string) {
    if (!dimensoesLivres.pode) return;
    const atuais = rascunho!.spec.dimensions;
    const novas = atuais.includes(key) ? atuais.filter((d) => d !== key) : [...atuais, key];
    mexer((w) => atualizarDimensoes(w, novas));
  }

  function editarSpec(patch: Partial<Widget["spec"]>) {
    setRascunho((atual) => (atual ? { ...atual, spec: { ...atual.spec, ...patch } } : atual));
    setSujo(true);
  }

  function fechar() {
    // Dirty-check: fechar com alteração pendente perde trabalho sem avisar.
    if (sujo) setConfirmandoSaida(true);
    else onFechar();
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Editar widget</DialogTitle>
            <DialogDescription className="flex items-start gap-2 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {/* A frase é o que deixa conferir o que se montou sem ler JSON. */}
              <span>{frase}</span>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Título</span>
                  <Input
                    value={rascunho.titulo}
                    onChange={(e) => {
                      setRascunho({ ...rascunho, titulo: e.target.value });
                      setSujo(true);
                    }}
                    className="h-9"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Tipo de gráfico</span>
                  <Select
                    value={rascunho.tipo}
                    onValueChange={(v) => {
                      setRascunho({ ...rascunho, tipo: v as TipoDeWidget });
                      setSujo(true);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_COM_ROTULO.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                          {t.id === tipoSugerido(rascunho.spec) && " (sugerido)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <Secao
                titulo="Métricas"
                permissao={metricasLivres}
                busca={buscaMetrica}
                onBusca={setBuscaMetrica}
              >
                {metricasAgrupadas(daEntidade.metrics, buscaMetrica).map((g) => (
                  <GrupoDeCampos
                    key={g.titulo}
                    grupo={g}
                    selecionados={rascunho.spec.metrics}
                    desabilitado={!metricasLivres.pode}
                    onAlternar={alternarMetrica}
                  />
                ))}

                {deOutrasEntidades.length > 0 && (
                  <GrupoDeCampos
                    grupo={{ titulo: "De outras entidades (vira 2ª consulta)", campos: deOutrasEntidades }}
                    selecionados={rascunho.specsExtras.flatMap((q) => q.metrics)}
                    desabilitado={false}
                    onAlternar={(k) => {
                      const c = catalogo.metrics.find((m) => m.key === k);
                      if (c) mexer((w) => adicionarMetricaDeOutraEntidade(w, c));
                    }}
                  />
                )}
              </Secao>

              <Secao
                titulo="Dimensões"
                permissao={dimensoesLivres}
                busca={buscaDimensao}
                onBusca={setBuscaDimensao}
              >
                {dimensoesAgrupadas(daEntidade.dimensions, buscaDimensao).map((g) => (
                  <GrupoDeCampos
                    key={g.titulo}
                    grupo={g}
                    selecionados={rascunho.spec.dimensions}
                    desabilitado={!dimensoesLivres.pode}
                    onAlternar={alternarDimensao}
                  />
                ))}
              </Secao>

              <ConstrutorDeFiltros
                spec={rascunho.spec}
                campos={daEntidade.dimensions}
                onMudar={(filters) => editarSpec({ filters })}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Ordenar por</span>
                  <Select
                    value={rascunho.spec.order_by[0]?.field ?? "__nenhuma"}
                    onValueChange={(v) =>
                      editarSpec({
                        order_by:
                          v === "__nenhuma" ? [] : [{ field: v, direction: "desc" as const }],
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhuma">Padrão</SelectItem>
                      {[...rascunho.spec.dimensions, ...rascunho.spec.metrics].map((k) => (
                        <SelectItem key={k} value={k}>
                          {rotulo(k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Direção</span>
                  <Select
                    value={rascunho.spec.order_by[0]?.direction ?? "desc"}
                    onValueChange={(v) =>
                      editarSpec({
                        order_by: rascunho.spec.order_by.length
                          ? [{ ...rascunho.spec.order_by[0]!, direction: v as "asc" | "desc" }]
                          : [],
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Maior primeiro</SelectItem>
                      <SelectItem value="asc">Menor primeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Limite de linhas</span>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={rascunho.spec.limit}
                    onChange={(e) => editarSpec({ limit: Number(e.target.value) || 500 })}
                    className="h-9"
                  />
                </label>
              </div>

              {rascunho.spec.dimensions.some((d) => d.endsWith(".date")) && (
                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Agrupar a data por</span>
                  <Select
                    value={rascunho.spec.date_granularity}
                    onValueChange={(v) =>
                      editarSpec({ date_granularity: v as "day" | "week" | "month" })
                    }
                  >
                    <SelectTrigger className="h-9 w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Dia</SelectItem>
                      <SelectItem value="week">Semana</SelectItem>
                      <SelectItem value="month">Mês</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              )}

              <SecaoDeCalculadas
                widget={rascunho}
                onMudar={(fn) => mexer(fn)}
                onEditarDerivadas={(derivadas) => {
                  setRascunho((atual) => (atual ? { ...atual, derivadas } : atual));
                  setSujo(true);
                }}
              />

              {avisos.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="size-3.5" />O que mudou junto
                  </p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {avisos.map((a) => (
                      <li key={a}>• {a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onSalvar(rascunho);
                setSujo(false);
              }}
              disabled={rascunho.spec.metrics.length === 0}
            >
              Salvar widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmandoSaida} onOpenChange={setConfirmandoSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações feitas neste widget serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmandoSaida(false);
                setSujo(false);
                onFechar();
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Secao({
  titulo,
  permissao,
  busca,
  onBusca,
  children,
}: {
  titulo: string;
  permissao: { pode: boolean; motivo?: string };
  busca: string;
  onBusca: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h4>
        {!permissao.pode && <Lock className="size-3 text-muted-foreground" />}
      </div>

      {!permissao.pode && permissao.motivo && (
        // O motivo, não só o campo cinza: "por que não posso mexer aqui" é a
        // pergunta que vira chamado de suporte.
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          {permissao.motivo}
        </p>
      )}

      {permissao.pode && (
        <Input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar…"
          className="h-8"
        />
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function GrupoDeCampos({
  grupo,
  selecionados,
  desabilitado,
  onAlternar,
}: {
  grupo: { titulo: string; campos: CampoDoCatalogo[] };
  selecionados: string[];
  desabilitado: boolean;
  onAlternar: (key: string) => void;
}) {
  if (grupo.campos.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {grupo.titulo}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {grupo.campos.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={desabilitado}
            onClick={() => onAlternar(c.key)}
            title={c.description}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              selecionados.includes(c.key)
                ? "border-primary bg-primary/10 font-medium"
                : "hover:bg-accent",
              desabilitado && "cursor-not-allowed opacity-50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConstrutorDeFiltros({
  spec,
  campos,
  onMudar,
}: {
  spec: Widget["spec"];
  campos: CampoDoCatalogo[];
  onMudar: (filters: Record<string, Filtro>) => void;
}) {
  const chaveDeData = `${spec.entity}.date`;
  // O filtro de data não aparece aqui: quem manda nele é o período do dashboard.
  const proprios = Object.entries(spec.filters).filter(([k]) => k !== chaveDeData);
  const disponiveis = campos.filter((c) => c.key !== chaveDeData && !(c.key in spec.filters));

  function definir(chave: string, filtro: Filtro) {
    onMudar({ ...spec.filters, [chave]: filtro });
  }

  function remover(chave: string) {
    const copia = { ...spec.filters };
    delete copia[chave];
    onMudar(copia);
  }

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Filtros do widget
      </h4>
      <p className="text-xs text-muted-foreground">
        O período vem do dashboard. Estes filtros se somam a ele.
      </p>

      {proprios.map(([chave, filtro]) => {
        const def = campos.find((c) => c.key === chave);
        const ops = operadoresPara(def?.semanticType ?? "text");
        const quantos = aridade(filtro.operator);
        const valores = Array.isArray(filtro.value)
          ? filtro.value
          : filtro.value !== undefined
            ? [filtro.value]
            : [];

        return (
          <div key={chave} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Badge variant="outline">{def?.label ?? chave}</Badge>

            <Select
              value={filtro.operator}
              onValueChange={(v) => definir(chave, { ...filtro, operator: v as Operador })}
            >
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o} value={o}>
                    {ROTULO_DO_OPERADOR[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {quantos !== 0 && (
              <Input
                value={valores.join(", ")}
                onChange={(e) => {
                  const bruto = e.target.value;
                  const partes = bruto.split(",").map((v) => v.trim()).filter(Boolean);
                  definir(chave, {
                    ...filtro,
                    value: quantos === 1 ? bruto : partes,
                  });
                }}
                placeholder={
                  quantos === "lista"
                    ? "valores separados por vírgula"
                    : quantos === 2
                      ? "início, fim"
                      : "valor"
                }
                className="h-8 flex-1 min-w-[160px]"
              />
            )}

            <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => remover(chave)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      })}

      {disponiveis.length > 0 && (
        <Select
          value="__novo"
          onValueChange={(v) => {
            const def = campos.find((c) => c.key === v);
            definir(v, { operator: operadoresPara(def?.semanticType ?? "text")[0]!, value: "" });
          }}
        >
          <SelectTrigger className="h-8 w-[220px]">
            <span className="flex items-center gap-1.5 text-xs">
              <Plus className="size-3.5" />
              Adicionar filtro
            </span>
          </SelectTrigger>
          <SelectContent>
            {disponiveis.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </section>
  );
}

/**
 * As consultas do widget e as colunas que as combinam.
 *
 * A chave de merge fica **visível**: é ela que decide o que casa com o quê, e a
 * pessoa precisa poder discordar. Escondê-la faria um número silenciosamente
 * errado parecer certo.
 */
function SecaoDeCalculadas({
  widget,
  onMudar,
  onEditarDerivadas,
}: {
  widget: Widget;
  onMudar: (fn: (w: Widget) => { widget: Widget; avisos: string[] }) => void;
  onEditarDerivadas: (derivadas: Derivada[]) => void;
}) {
  const consultas = [widget.spec, ...widget.specsExtras];
  const temExtras = widget.specsExtras.length > 0;
  const derivadas = widget.derivadas ?? [];

  if (!temExtras && derivadas.length === 0) return null;

  function definir(i: number, patch: Partial<Derivada>) {
    onEditarDerivadas(derivadas.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Consultas e colunas calculadas
      </h4>

      <div className="space-y-1.5">
        {consultas.map((q, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <Badge variant="secondary" className="font-mono">
              q{i}
            </Badge>
            <span className="truncate text-muted-foreground">
              {q.entity} · {q.metrics.join(", ")}
              {q.dimensions.length > 0 && ` · por ${q.dimensions.join(", ")}`}
            </span>
            {i > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto size-7 p-0"
                onClick={() => onMudar((w) => removerConsultaExtra(w, i - 1))}
                aria-label={`Remover consulta q${i}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {widget.mergeKey && (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          As consultas se casam por <span className="font-medium">{widget.mergeKey}</span> — cada
          linha de q0 procura a linha das outras com o mesmo valor. Sem par, a coluna fica vazia.
        </p>
      )}

      {derivadas.map((d, i) => (
        <div key={i} className="space-y-2 rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={d.label}
              onChange={(e) => definir(i, { label: e.target.value })}
              placeholder="Nome da coluna"
              className="h-8 w-[180px]"
            />
            <Select value={d.mode} onValueChange={(v) => definir(i, { mode: v as Derivada["mode"] })}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scalar">Um valor só</SelectItem>
                <SelectItem value="row">Por linha</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={d.semanticType}
              onValueChange={(v) => definir(i, { semanticType: v as Derivada["semanticType"] })}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="currency">Dinheiro</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="percent">Taxa</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto size-8 p-0"
              onClick={() => onEditarDerivadas(derivadas.filter((_, j) => j !== i))}
              aria-label={`Remover ${d.label}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <Input
            value={d.expression}
            onChange={(e) => definir(i, { expression: e.target.value })}
            placeholder="q0.trafego.spend - q1.vendas.revenue"
            className="h-8 font-mono text-xs"
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onEditarDerivadas([
              ...derivadas,
              {
                name: `calculada_${derivadas.length + 1}`,
                label: `Coluna ${derivadas.length + 1}`,
                expression: consultas.length > 1 ? "q0.a - q1.b" : "q0.a * 2",
                mode: temExtras ? "row" : "scalar",
                semanticType: "number",
              },
            ])
          }
        >
          <Plus className="size-3.5" />
          Coluna calculada
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Use <code className="font-mono">qN.chave</code>, os operadores + − × ÷ e parênteses.
          Divisão por zero devolve vazio.
        </span>
      </div>
    </section>
  );
}
