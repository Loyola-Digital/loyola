"use client";

/**
 * A Etapa de Aplicação.
 *
 * A tela responde três perguntas, nesta ordem: quantos se aplicaram, quantos
 * compraram, e de onde vieram. O resto é detalhe.
 *
 * ## Duas taxas, e por que as duas aparecem
 *
 * `vendas` é tudo que a planilha escolhida registrou. `converteram` é quantas
 * dessas vendas têm e-mail de quem se aplicou. Mostrar só uma esconde a outra:
 * quem vende muito por fora do formulário pareceria ter conversão péssima, e
 * quem casa bem pareceria vender pouco.
 *
 * ## A tabela de origem inclui quem não vendeu
 *
 * Uma origem que trouxe trinta aplicações e nenhuma venda é exatamente o que se
 * procura aqui. Ordenar por receita e cortar as de valor zero esconderia
 * justamente a resposta.
 */

import { useState } from "react";
import { ClipboardList, Info, Plus, Settings2, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import {
  useDashboardDaAplicacao,
  useFontesDaAplicacao,
  useSalvarFontesDaAplicacao,
  type QuebraPorOrigem,
  type RegraDeUtm,
} from "@/lib/hooks/use-stage-application";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import type { FunnelStage } from "@loyola-x/shared";

const JANELAS = [
  { dias: 7, label: "7d" },
  { dias: 30, label: "30d" },
  { dias: 90, label: "90d" },
  { dias: null, label: "Tudo" },
] as const;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const numero = (v: number) => v.toLocaleString("pt-BR");

function Kpi({
  label,
  valor,
  sub,
  destaque,
}: {
  label: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destaque ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/60"
      }`}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TabelaDeOrigem({
  titulo,
  ajuda,
  linhas,
}: {
  titulo: string;
  ajuda: string;
  linhas: QuebraPorOrigem[];
}) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 p-4">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nada com origem registrada no período.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 p-4">
      <p className="text-sm font-medium">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{ajuda}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="pb-1.5 font-medium">Origem</th>
              <th className="pb-1.5 text-right font-medium">Aplicações</th>
              <th className="pb-1.5 text-right font-medium">Vendas</th>
              <th className="pb-1.5 text-right font-medium">Receita</th>
              <th className="pb-1.5 text-right font-medium" title="Aplicações desta origem que viraram compra">
                Conv.
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              // `converteram`, não `vendas`: as vendas de uma origem não são
              // necessariamente de quem se aplicou por ela — uma compra pode
              // chegar por WhatsApp de quem entrou pelo Meta. Dividir por
              // `vendas` produzia "1 aplicação, 4 vendas, 400%", um número que
              // existia e não significava nada.
              //
              // Sem aplicação não há base: "—" é a resposta honesta, e 0% seria
              // uma afirmação diferente.
              const conv = l.aplicacoes > 0 ? (l.converteram / l.aplicacoes) * 100 : null;
              return (
                <tr key={l.origem} className="border-b border-border/20 last:border-0">
                  <td className="py-1.5 pr-2">{l.origem}</td>
                  <td className="py-1.5 text-right tabular-nums">{numero(l.aplicacoes)}</td>
                  <td className="py-1.5 text-right tabular-nums">{numero(l.vendas)}</td>
                  <td className="py-1.5 text-right tabular-nums">{brl(l.valor)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {conv === null ? "—" : `${conv.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROTULO_DO_CAMPO: Record<RegraDeUtm["campo"], string> = {
  utm_source: "utm_source (origem)",
  utm_medium: "utm_medium (público)",
  utm_campaign: "utm_campaign (campanha)",
  utm_content: "utm_content (criativo)",
  utm_term: "utm_term (termo)",
};

/**
 * O filtro que decide quais vendas são desta etapa.
 *
 * A planilha é do funil inteiro, então sem filtro a etapa conta venda que
 * nasceu de outro lugar. Só quem montou a campanha sabe qual UTM carrega a
 * marca — por isso se pergunta, em vez de adivinhar.
 *
 * `contém` é o padrão porque o caso mais comum é um pedaço de nome de campanha
 * ("pg04"); `igual` existe para id de conjunto, que precisa bater inteiro.
 */
function FiltroDeUtm({
  regras,
  campos,
  onMudar,
}: {
  regras: RegraDeUtm[];
  campos: RegraDeUtm["campo"][];
  onMudar: (r: RegraDeUtm[]) => void;
}) {
  function alterar(i: number, mudanca: Partial<RegraDeUtm>) {
    onMudar(regras.map((r, j) => (i === j ? { ...r, ...mudanca } : r)));
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Quais vendas são desta etapa</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          A planilha é do funil inteiro. Sem regra nenhuma, tudo entra. Com regras, só a venda que
          bate com <strong>todas</strong> elas conta — e dentro de cada regra, qualquer valor serve.
        </p>
      </div>

      {regras.map((regra, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/40 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={regra.campo}
              onChange={(e) => alterar(i, { campo: e.target.value as RegraDeUtm["campo"] })}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              {campos.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_DO_CAMPO[c]}
                </option>
              ))}
            </select>

            <select
              value={regra.modo}
              onChange={(e) => alterar(i, { modo: e.target.value as RegraDeUtm["modo"] })}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="contem">contém</option>
              <option value="igual">é igual a</option>
            </select>

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-muted-foreground"
              onClick={() => onMudar(regras.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <Input
            value={regra.valores.join(", ")}
            onChange={(e) =>
              // Vírgula separa: é como as pessoas escrevem lista, e evita um
              // botão de "adicionar valor" para cada item.
              alterar(i, { valores: e.target.value.split(",").map((v) => v.trim()) })
            }
            placeholder="pg04, aplicacao — separe por vírgula"
            className="h-8 text-xs"
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onMudar([...regras, { campo: "utm_campaign", modo: "contem", valores: [] }])}
        disabled={regras.length >= 5}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar regra
      </Button>
    </div>
  );
}

function EscolhaDeFontes({
  projectId,
  funnelId,
  stageId,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
}) {
  const { data, isLoading } = useFontesDaAplicacao(projectId, funnelId, stageId);
  const salvar = useSalvarFontesDaAplicacao(projectId, funnelId, stageId);
  const [marcadas, setMarcadas] = useState<string[] | null>(null);
  const [regras, setRegras] = useState<RegraDeUtm[] | null>(null);

  const atuais = marcadas ?? data?.escolhidas ?? [];
  const filtros = regras ?? data?.utmFilters ?? [];

  function alternar(id: string) {
    setMarcadas(atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]);
  }

  async function gravar() {
    try {
      // Valor em branco não vira regra vazia gravada: limpar aqui evita uma
      // regra que não filtra nada ocupando espaço na configuração.
      await salvar.mutateAsync({
        salesSpreadsheetIds: atuais,
        utmFilters: filtros
          .map((r) => ({ ...r, valores: r.valores.filter(Boolean) }))
          .filter((r) => r.valores.length > 0),
      });
      setMarcadas(null);
      setRegras(null);
      toast.success("Fontes e filtros atualizados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    }
  }

  if (isLoading) return <Skeleton className="h-32" />;

  const disponiveis = data?.disponiveis ?? [];

  return (
    <div className="space-y-3">
      <div>
        <Label>Planilhas de venda</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Quais contam como venda nesta etapa. Um funil costuma ter mais de uma natureza de venda
          conectada — produto principal, order bump, captação — e somar todas contaria coisas
          diferentes como se fossem a mesma.
        </p>
      </div>

      {disponiveis.length === 0 ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          Nenhuma planilha de venda conectada neste funil ainda. Conecte numa etapa de Vendas e ela
          aparece aqui.
        </p>
      ) : (
        <div className="space-y-1.5">
          {disponiveis.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border/40 p-2 hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={atuais.includes(f.id)}
                onChange={() => alternar(f.id)}
                className="mt-0.5 size-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {f.spreadsheetName} · {f.sheetName}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span>{f.stageName}</span>
                  <span>·</span>
                  <span>{f.subtype}</span>
                  {!f.temUtm && (
                    // Sem UTM a planilha entra, mas a quebra por origem sai
                    // toda em "Sem Track" — melhor avisar antes de escolher.
                    <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                      sem UTM
                    </Badge>
                  )}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      <FiltroDeUtm
        regras={filtros}
        campos={data?.camposDeUtm ?? ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]}
        onMudar={setRegras}
      />

      <Button
        onClick={gravar}
        disabled={salvar.isPending || (marcadas === null && regras === null)}
        size="sm"
      >
        Salvar
      </Button>
    </div>
  );
}

export function ApplicationStageView({
  projectId,
  funnelId,
  funnelName,
  stage,
}: {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}) {
  const [dias, setDias] = useState<number | null>(30);
  const [configOpen, setConfigOpen] = useState(false);
  const [nome, setNome] = useState("");
  const atualizarEtapa = useUpdateStage(projectId, funnelId, stage.id);

  const { data, isLoading } = useDashboardDaAplicacao(projectId, funnelId, stage.id, dias);

  async function salvarNome() {
    if (!nome.trim() || nome.trim() === stage.name) return;
    await atualizarEtapa.mutateAsync({ name: nome.trim() });
    toast.success("Nome atualizado");
  }

  const r = data?.resumo;
  const ticket = r && r.vendas > 0 ? r.valorTotal / r.vendas : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-0.5 text-xs text-muted-foreground">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              <ClipboardList className="h-3 w-3" />
              Aplicação
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Quem se aplicou pelo formulário, quem comprou, e de qual origem.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CampaignLogButton projectId={projectId} funnelId={funnelId} />
          <Sheet
            open={configOpen}
            onOpenChange={(o) => {
              setConfigOpen(o);
              if (o) setNome(stage.name);
            }}
          >
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar fontes
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Configurar etapa</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-6">
                <div className="space-y-1.5">
                  <Label htmlFor="nome-etapa">Nome</Label>
                  <div className="flex gap-2">
                    <Input
                      id="nome-etapa"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="h-9"
                    />
                    <Button size="sm" onClick={salvarNome}>
                      Salvar
                    </Button>
                  </div>
                </div>

                <EscolhaDeFontes projectId={projectId} funnelId={funnelId} stageId={stage.id} />

                <StageDeleteSection
                  projectId={projectId}
                  funnelId={funnelId}
                  stageId={stage.id}
                  stageName={stage.name}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {JANELAS.map((j) => (
          <button
            key={j.label}
            type="button"
            onClick={() => setDias(j.dias)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              dias === j.dias
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {j.label}
          </button>
        ))}
      </div>

      {/* Os avisos vêm ANTES dos números: um total de zero vendas porque
          ninguém escolheu a fonte não pode parecer um total de zero vendas. */}
      {(data?.avisos ?? []).map((a) => (
        <p
          key={a}
          className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400"
        >
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {a}
        </p>
      ))}

      {isLoading || !r ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Aplicações" valor={numero(r.aplicacoes)} sub="responderam o formulário" />
            <Kpi label="Vendas" valor={numero(r.vendas)} sub="nas planilhas escolhidas" />
            <Kpi label="Receita" valor={brl(r.valorTotal)} />
            <Kpi
              label="Aplicaram e compraram"
              valor={numero(r.converteram)}
              sub={
                r.taxaDeConversao === null
                  ? "sem aplicação no período"
                  : `${r.taxaDeConversao.toFixed(1)}% de quem se aplicou`
              }
              destaque
            />
            <Kpi label="Ticket médio" valor={ticket === null ? "—" : brl(ticket)} />
          </div>

          {data && data.descartadasPeloFiltro > 0 && (
            // Sem isto, "18 vendas viraram 3" parece dado sumindo.
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {numero(data.descartadasPeloFiltro)} venda
              {data.descartadasPeloFiltro !== 1 ? "s" : ""} da planilha ficou de fora pelo filtro de
              UTM desta etapa.
            </p>
          )}

          {/* A diferença entre `vendas` e `converteram` é informação, não erro:
              é a venda que aconteceu sem passar pelo formulário. */}
          {r.vendas > r.converteram && r.aplicacoes > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
              {numero(r.vendas - r.converteram)} venda
              {r.vendas - r.converteram !== 1 ? "s" : ""} sem aplicação correspondente — compra que
              não passou pelo formulário, ou e-mail diferente do cadastrado.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <TabelaDeOrigem
              titulo="Por utm_source"
              ajuda="De onde veio o tráfego — Meta, Google, orgânico."
              linhas={r.porUtmSource}
            />
            <TabelaDeOrigem
              titulo="Por utm_medium"
              ajuda="O público ou conjunto dentro da origem."
              linhas={r.porUtmMedium}
            />
          </div>
        </>
      )}
    </div>
  );
}
