"use client";

/**
 * Match de origem — de "46 leads sem origem" para "esses 31 vieram do stories".
 *
 * A tela tem três partes, na ordem em que a pergunta aparece:
 *
 *   1. o quadro   quantos leads não têm origem — e quanto disso já é regra
 *   2. a quebra   como os que sobraram se distribuem por um campo qualquer
 *   3. as regras  o que está recuperando, e o que cada uma alcança
 *
 * A parte 2 é o miolo. Um total de leads órfãos não sugere ação nenhuma;
 * quebrá-lo por `utm_medium` e ver "stories: 31" transforma o número num grupo
 * que dá para atribuir de uma vez.
 *
 * Nada aqui altera a planilha. A atribuição vira REGRA, aplicada na leitura —
 * o que também faz o lead de amanhã com o mesmo padrão já entrar classificado.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  montarOrigem,
  useAtualizarRegra,
  useCriarRegras,
  useDiagnosticoDeOrigem,
  useOrfasPorCampo,
  useRemoverRegra,
  type DiagnosticoDeOrigem,
  type OperadorDeRegra,
  type RegraDeOrigem,
} from "@/lib/hooks/use-source-match";

const ROTULO_DO_OPERADOR: Record<OperadorDeRegra, string> = {
  igual: "é igual a",
  contem: "contém",
  comeca_com: "começa com",
  vazio: "está em branco",
};

function Numero({
  rotulo,
  valor,
  tom,
  ajuda,
}: {
  rotulo: string;
  valor: number;
  tom?: "alerta" | "bom";
  ajuda?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={`font-mono text-xl tabular-nums ${
          tom === "alerta"
            ? "text-amber-600 dark:text-amber-400"
            : tom === "bom"
              ? "text-emerald-600 dark:text-emerald-400"
              : ""
        }`}
      >
        {valor}
      </p>
      {ajuda && <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

/**
 * O veredito, com a causa separada.
 *
 * Duas situações que parecem a mesma ("não está rastreando") pedem ações
 * opostas: nenhum lead com origem é link sem parâmetro — o problema está na
 * origem do tráfego; alguns sem origem é caso pontual — dá para atribuir por
 * regra aqui mesmo. Uma mensagem só mandaria metade das pessoas para o lugar
 * errado.
 */
function Veredito({ d }: { d: DiagnosticoDeOrigem }) {
  if (d.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma aplicação no período — não há o que diagnosticar.
      </p>
    );
  }

  const semNada = d.comOrigem === 0 && d.recuperadas === 0;
  const tudoCerto = d.semOrigem === 0;

  if (semNada) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="text-xs">
          <p className="font-medium">Nenhuma aplicação tem origem</p>
          <p className="mt-0.5 text-muted-foreground">
            Todas as {d.total} chegaram sem <code className="font-mono">utm_source</code>. Isso
            costuma ser link publicado sem os parâmetros de rastreamento — corrigir aqui por regra
            resolve o passado, mas o link precisa ser arrumado para o futuro parar de chegar assim.
          </p>
        </div>
      </div>
    );
  }

  if (tudoCerto) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="text-xs">
          <p className="font-medium">Rastreamento em ordem</p>
          <p className="mt-0.5 text-muted-foreground">
            As {d.total} aplicações têm origem
            {d.recuperadas > 0 ? ` — ${d.recuperadas} por regra desta tela.` : "."}
          </p>
        </div>
      </div>
    );
  }

  const pct = Math.round((d.semOrigem / d.total) * 100);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="text-xs">
        <p className="font-medium">
          {d.semOrigem} de {d.total} aplicações sem origem ({pct}%)
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Elas não entram em nenhuma leitura por canal. Escolha um campo abaixo para ver de onde
          vieram e atribuir a origem.
        </p>
      </div>
    </div>
  );
}

export function SourceMatchTab({
  projectId,
  funnelId,
}: {
  projectId: string;
  funnelId: string;
  /** Mantido pela chamada existente; a regra não é mais por etapa. */
  stageId?: string;
}) {
  /**
   * Por padrão a tela olha o PROJETO inteiro.
   *
   * É onde a regra vale, então é onde ela precisa ser decidida: classificar
   * olhando um funil só levaria a criar a mesma regra várias vezes, sem saber
   * que a primeira já resolvia as outras.
   */
  const [soEsteFunil, setSoEsteFunil] = useState(false);
  const escopo = soEsteFunil ? funnelId : undefined;

  const { data, isLoading } = useDiagnosticoDeOrigem(projectId, escopo);
  const [campo, setCampo] = useState<string | null>(null);
  const { data: orfas, isFetching: buscandoOrfas } = useOrfasPorCampo(projectId, escopo, campo);
  const criar = useCriarRegras(projectId);
  const atualizar = useAtualizarRegra(projectId);
  const remover = useRemoverRegra(projectId);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<"pago" | "organico">("organico");
  const [canal, setCanal] = useState("");
  /** Qual origem existente está sendo classificada (o outro fluxo da tela). */
  const [classificando, setClassificando] = useState<string | null>(null);
  const [tipoDaOrigem, setTipoDaOrigem] = useState<"pago" | "organico">("pago");

  const grupos = orfas?.grupos ?? [];
  const totalSelecionado = useMemo(
    () => grupos.filter((g) => selecionados.has(g.valor)).reduce((n, g) => n + g.quantidade, 0),
    [grupos, selecionados],
  );
  const origemPrevista = montarOrigem(tipo, canal);

  function alternar(valor: string) {
    setSelecionados((atual) => {
      const nova = new Set(atual);
      if (nova.has(valor)) nova.delete(valor);
      else nova.add(valor);
      return nova;
    });
  }

  function atribuir() {
    if (!campo || selecionados.size === 0 || !canal.trim()) return;
    const regras = [...selecionados].map((valor) => ({
      campo,
      // Valor em branco vira a regra "está em branco" — sem isso, o grupo dos
      // vazios (que costuma ser o maior) seria o único que não dá para atribuir.
      operador: (valor === "" ? "vazio" : "igual") as OperadorDeRegra,
      valor,
      origem: origemPrevista,
    }));
    criar.mutate(regras, {
      onSuccess: () => {
        toast.success(
          `${totalSelecionado} ${totalSelecionado === 1 ? "aplicação recuperada" : "aplicações recuperadas"} como ${origemPrevista}`,
        );
        setSelecionados(new Set());
        setCanal("");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar as regras"),
    });
  }

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;

  if (data?.semPlanilha) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
        <p className="text-sm font-medium">Nenhuma planilha de aplicações conectada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          O match de origem lê as mesmas planilhas da aba de aplicações.
        </p>
      </div>
    );
  }

  const d = data?.diagnostico;
  const regras = data?.regras ?? [];

  return (
    <div className="space-y-6">
      {/* 0. O escopo — a informação mais importante da tela */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <Globe className="size-4 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          A regra que você criar aqui vale para{" "}
          <span className="font-medium text-foreground">o projeto inteiro</span> — todos os funis,
          todas as etapas, e também no BI. O <code>utm_source</code> &quot;instagram&quot; é o mesmo
          em qualquer lugar.
        </p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={soEsteFunil}
            onChange={(e) => {
              setSoEsteFunil(e.target.checked);
              setSelecionados(new Set());
            }}
            className="size-3.5 accent-amber-600"
          />
          Analisar só este funil
        </label>
      </div>

      {/* 1. O quadro */}
      {d && (
        <div className="space-y-3">
          <Veredito d={d} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Numero rotulo="Aplicações" valor={d.total} />
            <Numero rotulo="Com origem" valor={d.comOrigem} ajuda="veio da planilha" />
            <Numero
              rotulo="Recuperadas"
              valor={d.recuperadas}
              tom={d.recuperadas > 0 ? "bom" : undefined}
              ajuda="por regra do projeto"
            />
            <Numero
              rotulo="Sem origem"
              valor={d.semOrigem}
              tom={d.semOrigem > 0 ? "alerta" : undefined}
            />
            <Numero rotulo="Pago" valor={d.pago} />
            <Numero rotulo="Orgânico" valor={d.organico} />
          </div>
          {d.indefinido > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {d.indefinido} com origem que não começa com{" "}
              <code className="font-mono">paid_</code> nem <code className="font-mono">organic_</code>
              . Elas têm origem, mas não entram na conta de pago nem de orgânico — é a convenção de
              nome que separa os dois.
            </p>
          )}
        </div>
      )}

      {/* 2. A quebra */}
      {d && d.semOrigem > 0 && (
        <div className="space-y-3 rounded-xl border border-border/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Analisar as sem origem por
              </Label>
              <Select value={campo ?? ""} onValueChange={setCampo}>
                <SelectTrigger className="h-8 w-[240px] text-sm">
                  <SelectValue placeholder="Escolha uma coluna" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.colunas ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === "__aba" ? "Aba da planilha" : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {buscandoOrfas && (
              <span className="flex items-center gap-1.5 pb-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                lendo a planilha…
              </span>
            )}
          </div>

          {campo && grupos.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground">
                Clique nos grupos que vieram da mesma origem e atribua embaixo.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {grupos.map((g) => {
                  const ativo = selecionados.has(g.valor);
                  return (
                    <button
                      key={g.valor || "__vazio"}
                      type="button"
                      onClick={() => alternar(g.valor)}
                      title={g.exemplos.length ? `ex.: ${g.exemplos.join(", ")}` : undefined}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                        ativo
                          ? "border-primary bg-primary/10"
                          : "border-border/60 hover:bg-muted"
                      }`}
                    >
                      <span className={g.valor ? "" : "italic text-muted-foreground"}>
                        {g.label}
                      </span>
                      <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                        {g.quantidade}
                      </Badge>
                    </button>
                  );
                })}
              </div>

              {selecionados.size > 0 && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as "pago" | "organico")}>
                      <SelectTrigger className="h-8 w-[130px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pago">Tráfego pago</SelectItem>
                        <SelectItem value="organico">Orgânico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Canal</Label>
                    {/* Só o nome: o prefixo entra no servidor. É o que protege a
                        convenção paid_/organic_ de erro de digitação — e é ela
                        que separa pago de orgânico no resto do sistema. */}
                    <Input
                      value={canal}
                      onChange={(e) => setCanal(e.target.value)}
                      placeholder="instagram, metaads, indicacao…"
                      className="h-8 w-[200px] text-sm"
                    />
                  </div>
                  <div className="pb-1.5 text-[11px] text-muted-foreground">
                    vira{" "}
                    <code className="font-mono text-foreground">
                      {canal.trim() ? origemPrevista : "—"}
                    </code>
                  </div>
                  <Button
                    size="sm"
                    className="mb-0.5 gap-1.5"
                    disabled={!canal.trim() || criar.isPending}
                    onClick={atribuir}
                  >
                    {criar.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Atribuir a {totalSelecionado}
                  </Button>
                </div>
              )}
            </>
          )}

          {campo && !buscandoOrfas && grupos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma aplicação sem origem sobrou nesse recorte.
            </p>
          )}
        </div>
      )}

      {/* 2b. Classificar as origens que existem mas não dizem o tipo */}
      {(data?.aClassificar?.length ?? 0) > 0 && (
        <div className="space-y-3 rounded-xl border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium">Origens sem classificação</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estas aplicações têm origem, mas o nome não diz se o tráfego é pago ou orgânico —
              então elas ficam de fora de qualquer leitura por tipo. Classifique cada canal uma
              vez; vale para o que já entrou e para o que vier.
            </p>
          </div>

          <div className="space-y-1.5">
            {(data?.aClassificar ?? []).map((g) => (
              <div
                key={g.valor}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 px-3 py-2"
              >
                <code className="font-mono text-xs">{g.label}</code>
                <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                  {g.quantidade}
                </Badge>
                {g.variacoes.length > 1 && (
                  // Duas grafias do mesmo canal são contadas juntas aqui. Dizer
                  // isso evita a leitura de que um sumiu.
                  <span className="text-[10px] text-muted-foreground">
                    junta {g.variacoes.join(" + ")}
                  </span>
                )}

                {classificando === g.valor ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Select
                      value={tipoDaOrigem}
                      onValueChange={(v) => setTipoDaOrigem(v as "pago" | "organico")}
                    >
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="organico">Orgânico</SelectItem>
                      </SelectContent>
                    </Select>
                    <code className="font-mono text-[10px] text-muted-foreground">
                      {montarOrigem(tipoDaOrigem, g.valor)}
                    </code>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={criar.isPending}
                      onClick={() =>
                        criar.mutate(
                          {
                            campo: "utm_source",
                            operador: "igual",
                            valor: g.valor,
                            origem: montarOrigem(tipoDaOrigem, g.valor),
                          },
                          {
                            onSuccess: () => {
                              toast.success(
                                `${g.quantidade} classificadas como ${montarOrigem(tipoDaOrigem, g.valor)}`,
                              );
                              setClassificando(null);
                            },
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Erro ao classificar"),
                          },
                        )
                      }
                    >
                      Aplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setClassificando(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-xs"
                    onClick={() => setClassificando(g.valor)}
                  >
                    Classificar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. As regras */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Regras de origem
          </p>
          {regras.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {regras.length} {regras.length === 1 ? "regra" : "regras"} · aplicadas na leitura,
              a planilha não muda
            </span>
          )}
        </div>

        {regras.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
            <Sparkles className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma regra ainda. As que você criar acima aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {regras.map((r: RegraDeOrigem) => (
              <div
                key={r.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-xs ${
                  r.ativa ? "" : "opacity-50"
                }`}
              >
                <span className="text-muted-foreground">
                  quando <code className="font-mono text-foreground">{r.campo}</code>{" "}
                  {ROTULO_DO_OPERADOR[r.operador]}
                  {r.operador !== "vazio" && (
                    <>
                      {" "}
                      <code className="font-mono text-foreground">{r.valor}</code>
                    </>
                  )}
                </span>
                <span className="text-muted-foreground">→</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {r.origem}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={r.ativa}
                    onCheckedChange={(v) =>
                      atualizar.mutate(
                        { id: r.id, dados: { ativa: v } },
                        { onError: () => toast.error("Erro ao atualizar") },
                      )
                    }
                    aria-label={r.ativa ? "Desativar regra" : "Ativar regra"}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    aria-label="Remover regra"
                    onClick={() =>
                      remover.mutate(r.id, {
                        onSuccess: () => toast.success("Regra removida"),
                        onError: () => toast.error("Erro ao remover"),
                      })
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
