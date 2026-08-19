"use client";

/**
 * Story 44.9 — a aba "Inácio": a cadeia de decomposição de CAC de uma etapa.
 *
 * ## O que esta tela NÃO faz
 *
 * Não calcula. O payload chega com `atuais`, `tetos`, `ranking`, `composto` e
 * `benchmarks` prontos, e até o selo 🟢🟡🔴 vem de `sinalizar()` no shared —
 * porque comparação com direção é regra, não estilo, e o agente Inácio lê a
 * mesma regra pela REST sem passar por aqui.
 *
 * A única derivação local é a escolha do benchmark constante (spec §5), e ela
 * mora em `lib/utils/cadeia-cac-view.ts`, testada.
 *
 * ## O que ela faz questão de mostrar
 *
 * Os MOTIVOS. O payload distingue `semDados`, `baseInsuficiente`,
 * `naoAtribuivel`, `coberturaAtipica`, `leituraFalhou`, `syncPendente` e
 * `indeterminado` — cada um pede uma ação diferente de quem está olhando.
 * Colapsar tudo em "sem dados" desfaria o trabalho de quatro stories.
 */

import { useMemo } from "react";
import { AlertTriangle, Info, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCadeiaCac } from "@/lib/hooks/use-cadeia-cac";
import { montarTabela, type LinhaDaCadeia, type MotivoSemAlvo } from "@/lib/utils/cadeia-cac-view";
import type { Metrica, Selo } from "@loyola-x/shared/src/cadeia-cac";

const ROTULO: Record<Metrica, string> = {
  cpm: "CPM",
  ctr: "CTR",
  cpc: "CPC",
  connectRate: "Connect Rate",
  convLP: "Conv. LP",
};

/** Dinheiro absoluto · CPM na escala ÷1.000 · taxa em decimal → só aqui vira %. */
const DINHEIRO: ReadonlySet<Metrica> = new Set<Metrica>(["cpm", "cpc"]);

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function formatar(metrica: Metrica, v: number | null): string {
  if (v === null) return "—";
  return DINHEIRO.has(metrica) ? brl(v) : pct(v);
}

const COR_DO_SELO: Record<Selo, string> = {
  verde: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amarelo: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  vermelho: "bg-red-500/15 text-red-700 dark:text-red-400",
};
const ICONE_DO_SELO: Record<Selo, string> = { verde: "🟢", amarelo: "🟡", vermelho: "🔴" };

const TEXTO_SEM_ALVO: Record<MotivoSemAlvo, string> = {
  semTeto: "Nenhuma campanha do grupo atingiu o piso de confiança para gerar um teto.",
  semBenchmark: "Não há mediana: nenhuma campanha elegível no grupo.",
  vslNaoRespondido:
    "O benchmark de Conv. LP (4% / 7,5%) só se aplica a LP com VSL, e ninguém respondeu se esta tem. Preencha na configuração da etapa.",
  semVsl: "A LP desta etapa não tem VSL — a spec não define benchmark de Conv. LP fora de VSL.",
  semTicket: "Falta o ticket médio: sem ele não dá para escolher entre 4% (>R$147) e 7,5%.",
};

/** Motivos que o payload manda, traduzidos para a ação que cada um pede. */
const TEXTO_DO_MOTIVO: Record<string, string> = {
  semDados: "Não há dado para este período.",
  baseInsuficiente: "Há série, mas nenhuma janela de 7 dias atinge o piso de confiança.",
  naoAtribuivel: "O dado existe, mas não é atribuível a esta dimensão.",
  coberturaAtipica:
    "Toda janela elegível foi barrada pela guarda de rastreio: em todas elas a cobertura ficou muito abaixo da mediana da etapa, então o teto viria de uma semana de rastreio ruim, não de conversão melhor.",
  leituraFalhou: "A fonte existe, mas a leitura falhou — verifique a permissão e tente de novo.",
  syncPendente: "A fonte está conectada; o cache ainda não foi computado.",
  indeterminado: "Não foi possível determinar se a etapa tem fonte conectada.",
  foraDaAba: "Esta etapa não pertence a nenhuma das duas famílias da aba.",
};

function Motivo({ motivo, texto }: { motivo?: string | null; texto?: string | null }) {
  if (!motivo && !texto) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span className="text-muted-foreground">
        {texto ?? (motivo ? (TEXTO_DO_MOTIVO[motivo] ?? motivo) : null)}
      </span>
    </div>
  );
}

function LinhaTabela({ l }: { l: LinhaDaCadeia }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2.5 pr-4 font-medium">{ROTULO[l.metrica]}</td>
      <td className="py-2.5 pr-4 tabular-nums">{formatar(l.metrica, l.atual)}</td>
      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
        {l.teto !== null ? (
          formatar(l.metrica, l.teto)
        ) : (
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger className="cursor-help underline decoration-dotted">—</TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {l.motivoDoTeto ? (TEXTO_DO_MOTIVO[l.motivoDoTeto] ?? l.motivoDoTeto) : "Sem teto."}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        )}
      </td>
      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
        {l.benchmark !== null ? (
          <span className="inline-flex items-center gap-1.5">
            {formatar(l.metrica, l.benchmark)}
            {l.origemDoBenchmark === "mediana-historica" && (
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help text-[10px] font-normal">
                      mediana histórica
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Não existe benchmark de mercado para {ROTULO[l.metrica]}. Este é a mediana das{" "}
                    {l.campanhasNaMediana ?? 0} campanha(s) elegível(is) do grupo — referência do
                    que é típico aqui, não do que é saudável.
                  </TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            )}
          </span>
        ) : l.motivoSemAlvo ? (
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger className="cursor-help underline decoration-dotted">—</TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {TEXTO_SEM_ALVO[l.motivoSemAlvo]}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        ) : (
          "—"
        )}
      </td>
      <td className="py-2.5">
        {l.selo ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${COR_DO_SELO[l.selo]}`}
          >
            {ICONE_DO_SELO[l.selo]}
            {l.alvo !== null && (
              <span className="tabular-nums opacity-80">
                alvo {formatar(l.metrica, l.alvo)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">sem alvo</span>
        )}
      </td>
    </tr>
  );
}

export function CadeiaCacStageTab({
  projectId,
  stageId,
}: {
  projectId: string;
  stageId: string;
}) {
  const { data, isLoading, error } = useCadeiaCac(projectId, stageId);
  const linhas = useMemo(() => (data ? montarTabela(data) : []), [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Motivo texto={`Não foi possível carregar a cadeia de CAC: ${(error as Error).message}`} />
    );
  }
  if (!data) return null;

  // Etapa fora da aba ou sem série: motivo, nunca tela vazia.
  if (data.semDados) {
    return <Motivo motivo={data.motivo} texto={data.message} />;
  }

  const p = data.principal;
  const ehPaga = data.familia === "paga";

  return (
    <div className="space-y-6">
      {/* O número principal — spec §2.1 */}
      <div className="rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">
              {ehPaga ? "CAC real" : "CPL real"}
              <span className="ml-2 text-xs">
                = investimento ÷ {ehPaga ? "vendas" : "leads únicos"} do Loyola
              </span>
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {p?.valor != null ? brl(p.valor) : "—"}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            <div>{p?.spend != null ? brl(p.spend) : "—"} investidos</div>
            <div>
              {ehPaga ? `${p?.vendasReais ?? 0} vendas` : `${p?.leadsUnicos ?? 0} leads`}
            </div>
          </div>
        </div>
        {p?.motivo && <div className="mt-3"><Motivo motivo={p.motivo} texto={p.message} /></div>}
        {/* Imposto declarado, para ninguém aplicar de novo por fora. */}
        {data.spendIncludesMetaTax && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            O investimento já inclui o imposto Meta (12,15%).
          </p>
        )}
      </div>

      {/* A cadeia — spec §2.2, §4, §5, §6 */}
      <div className="rounded-lg border">
        <div className="border-b px-5 py-3">
          <h3 className="font-medium">Cadeia de decomposição</h3>
          <p className="text-xs text-muted-foreground">
            Alvo vigente = teto quando existe, benchmark quando não.
          </p>
        </div>
        <div className="overflow-x-auto px-5 py-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Métrica</th>
                <th className="py-2 pr-4 font-medium">Atual</th>
                <th className="py-2 pr-4 font-medium">Teto</th>
                <th className="py-2 pr-4 font-medium">Benchmark</th>
                <th className="py-2 font-medium">Selo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <LinhaTabela key={l.metrica} l={l} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ranking — spec §3. CPM e CTR ficam fora por identidade, não por escolha. */}
      {data.ranking && data.ranking.length > 0 && (
        <div className="rounded-lg border p-5">
          <h3 className="mb-1 font-medium">Onde atacar primeiro</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Queda real de custo ao levar cada métrica até o teto. CPM e CTR não entram: a queda do
            CPC já contém as duas.
          </p>
          <ol className="space-y-2">
            {data.ranking.map((i, idx) => (
              <li key={i.metrica} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-muted-foreground tabular-nums">{idx + 1}.</span>
                <span className="w-32 font-medium">{ROTULO[i.metrica]}</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-emerald-600">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {pct(i.queda, 1)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatar(i.metrica, i.atual)} → {formatar(i.metrica, i.teto)}
                </span>
              </li>
            ))}
          </ol>

          {data.composto?.queda != null && (
            <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
              <span className="font-medium">Composto: {pct(data.composto.queda, 1)}</span>
              <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                cenário teórico
              </Badge>
              <p className="mt-1 text-xs text-muted-foreground">
                Os tetos vêm de campanhas diferentes, e multiplicar taxas assume independência
                entre os elos — que eles não têm.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tudo que o payload declara como indisponível fica VISÍVEL. */}
      <div className="space-y-3">
        {/* Story 44.12 — quatro estados, e três deles precisam aparecer.
            `aplicada` é o único que não pede ação, mas ainda assim informa: sem
            isso o operador não distingue "protegido" de "não sei". */}
        {(data.guardaDeCobertura?.estado === "indisponivel" ||
          data.guardaDeCobertura?.estado === "semLeadNoPeriodo") && (
          <Motivo texto={data.guardaDeCobertura.message} />
        )}
        {data.guardaDeCobertura?.estado === "aplicada" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            Guarda de rastreio ativa: o teto de Conv. LP considerou {data.guardaDeCobertura.dias}{" "}
            dia(s) com lead e descartou janelas de cobertura atípica.
          </p>
        )}
        {data.atribuicao?.motivo === "naoAtribuivel" && (
          <Motivo texto={data.atribuicao.message} />
        )}
        {data.vendasSemDataNoTotal != null && data.vendasSemDataNoTotal > 0 && (
          <Motivo
            texto={`${data.vendasSemDataNoTotal} venda(s) do TOTAL da etapa não têm data legível e ficam fora de qualquer recorte por período.`}
          />
        )}
      </div>
    </div>
  );
}
