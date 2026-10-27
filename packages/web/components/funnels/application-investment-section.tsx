"use client";

// Story 18.96 — o investimento da etapa de Aplicação: cards de custo e a tabela
// "Dados diários". A conta mora em `lib/utils/dados-diarios-da-aplicacao.ts`.
//
// Não reaproveita o `SalesDailyTable` (18.95): aquele é de venda (origens,
// faturamento, ROAS, checkouts). O visual é o mesmo (cabeçalho fixo, Dia
// ordenável, "Sem data" e Total no rodapé); o conteúdo é de aplicação.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import type { DashboardDaAplicacao } from "@/lib/hooks/use-stage-application";
import {
  DIAS_MAX_DA_META,
  diasDaMeta,
  montarDadosDiariosDaAplicacao,
  type LinhaDiariaDaAplicacao,
} from "@/lib/utils/dados-diarios-da-aplicacao";
import {
  ORDEM_DO_DIA_PADRAO,
  inverterOrdemDoDia,
  type OrdemDoDia,
} from "@/lib/utils/ordem-do-dia";
import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";

interface ApplicationInvestmentSectionProps {
  projectId: string;
  campaignIds: string[];
  /** A janela da etapa; `null` = "Tudo". */
  dias: number | null;
  dashboard: DashboardDaAplicacao | undefined;
}

function fmtDia(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** O primeiro dia que a Meta cobre na janela "Tudo" — `aaaa-mm-dd`, local. */
function inicioDaMetaNoTudo(): string {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_MAX_DA_META);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type Coluna = {
  rotulo: string;
  dica: string;
  meta: boolean;
  valor: (r: LinhaDiariaDaAplicacao) => ReactNode;
};

const COLUNAS: Coluna[] = [
  { rotulo: "Investimento", dica: "Gasto Meta das campanhas da etapa no dia, com o imposto (12,15%)", meta: true, valor: (r) => fmtCurrency(r.investimento) },
  { rotulo: "Aplicações", dica: "Respostas do formulário no dia — a mesma conta do card Aplicações", meta: false, valor: (r) => fmtInt(r.aplicacoes) },
  { rotulo: "Aplicações pagas", dica: "Aplicações com utm_source meta ou meta-ads", meta: false, valor: (r) => fmtInt(r.aplicacoesPagas) },
  { rotulo: "Custo/aplic. paga", dica: "Investimento ÷ Aplicações pagas", meta: true, valor: (r) => fmtCurrency(r.custoPorAplicacaoPaga) },
  { rotulo: "Custo/aplic. geral", dica: "Investimento ÷ todas as Aplicações", meta: true, valor: (r) => fmtCurrency(r.custoPorAplicacaoGeral) },
  { rotulo: "Impressões", dica: "Impressões Meta", meta: true, valor: (r) => fmtInt(r.impressoes) },
  { rotulo: "Cliques", dica: "Cliques no link (link_click)", meta: true, valor: (r) => fmtInt(r.cliques) },
  { rotulo: "CTR", dica: "Cliques no link ÷ Impressões", meta: true, valor: (r) => fmtPercent(r.ctr) },
  { rotulo: "CPM", dica: "Investimento × 1000 ÷ Impressões", meta: true, valor: (r) => fmtCurrency(r.cpm) },
  { rotulo: "CPC", dica: "Investimento ÷ Cliques no link", meta: true, valor: (r) => fmtCurrency(r.cpc) },
  { rotulo: "LP Views", dica: "landing_page_view da Meta", meta: true, valor: (r) => fmtInt(r.lpViews) },
];

function Card({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ApplicationInvestmentSection({
  projectId,
  campaignIds,
  dias,
  dashboard,
}: ApplicationInvestmentSectionProps) {
  const [ordem, setOrdem] = useState<OrdemDoDia>(ORDEM_DO_DIA_PADRAO);
  const temCampanha = campaignIds.length > 0;
  const meta = useCampaignDailyInsightsBulk(projectId, temCampanha ? campaignIds : null, diasDaMeta(dias));
  const metaDesde = dias == null ? inicioDaMetaNoTudo() : undefined;

  const dados = useMemo(
    () => montarDadosDiariosDaAplicacao({ meta: meta.data, temCampanha, dashboard, metaDesde, ordem }),
    [meta.data, temCampanha, dashboard, metaDesde, ordem],
  );

  // AC5: sem campanha, só Data · Aplicações · Aplicações pagas.
  const colunas = useMemo(() => COLUNAS.filter((c) => temCampanha || !c.meta), [temCampanha]);

  if (temCampanha && meta.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  const c = dados.cards;
  const celulas = (r: LinhaDiariaDaAplicacao) =>
    colunas.map((col) => (
      <TableCell key={col.rotulo} className="text-right whitespace-nowrap">
        {col.valor(r)}
      </TableCell>
    ));

  // Sem campanha e sem aplicação por dia (API anterior) não há o que tabelar.
  const mostraTabela = !!dados.total && (temCampanha || dados.temAplicacoesPorDia);

  return (
    <div className="space-y-4">
      {c ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Card label="Investimento" valor={fmtCurrency(c.investimento)} sub="Spend Meta + imposto" />
            <Card
              label="Custo por aplicação paga"
              valor={fmtCurrency(c.custoPorAplicacaoPaga)}
              sub={`÷ ${fmtInt(c.aplicacoesPagas)} aplicações da Meta`}
            />
            <Card
              label="Custo por aplicação geral"
              valor={fmtCurrency(c.custoPorAplicacaoGeral)}
              sub={`÷ ${fmtInt(c.aplicacoes)} aplicações`}
            />
            <Card label="CPM" valor={fmtCurrency(c.cpm)} />
            <Card label="CPC" valor={fmtCurrency(c.cpc)} sub="clique no link" />
            <Card label="CTR" valor={fmtPercent(c.ctr)} sub="clique no link" />
          </div>
          {dias == null && (
            // AC4: o custo do "Tudo" mistura janelas — quem lê precisa saber.
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Investimento limitado aos últimos {DIAS_MAX_DA_META} dias (o máximo da Meta); as aplicações são de
              todo o período.
            </p>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Vincule as campanhas Meta em Configurar fontes para ver investimento e custo por aplicação.
        </p>
      )}

      {mostraTabela && dados.total && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold">Dados diários</h3>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[90px]">
                    <button
                      type="button"
                      onClick={() => setOrdem((o) => inverterOrdemDoDia(o))}
                      className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
                      title={
                        ordem === "desc"
                          ? "Mais recente primeiro — clique para inverter"
                          : "Mais antigo primeiro — clique para inverter"
                      }
                      aria-label={`Ordenar por dia: ${ordem === "desc" ? "decrescente" : "crescente"}`}
                    >
                      Dia
                      {ordem === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                    </button>
                  </TableHead>
                  {colunas.map((col) => (
                    <TableHead key={col.rotulo} className="text-right whitespace-nowrap cursor-help" title={col.dica}>
                      {col.rotulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.dias.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="sticky left-0 bg-background z-10 whitespace-nowrap">{fmtDia(r.date)}</TableCell>
                    {celulas(r)}
                  </TableRow>
                ))}
                {dados.semData && (
                  <TableRow className="text-muted-foreground">
                    <TableCell
                      className="sticky left-0 bg-background z-10 whitespace-nowrap cursor-help"
                      title="Aplicações sem data na planilha — não caem em dia nenhum, mas entram no card e no Total"
                    >
                      Sem data
                    </TableCell>
                    {celulas(dados.semData)}
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
                  {celulas(dados.total)}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
