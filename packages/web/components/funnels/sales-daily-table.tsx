"use client";

// Story 18.95 — "Dados diários" da etapa de Vendas, acima de "Vendas por dia —
// produto principal". Meta das campanhas da etapa × vendas do Produto
// Principal, um dia por linha; a conta mora em `lib/utils/dados-diarios-de-vendas.ts`.
//
// Não reaproveita o `CrossedFunnelDailyTable`: aquele é de captação (leads,
// ingressos, CPL, Tx Conv. e rótulos por tipo de etapa). Aqui o visual é o
// mesmo (cabeçalho fixo, Dia ordenável, Total no rodapé); o conteúdo é de venda.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
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
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import {
  montarDadosDiariosDeVendas,
  type LinhaDiariaDeVendas,
} from "@/lib/utils/dados-diarios-de-vendas";
import {
  ORDEM_DO_DIA_PADRAO,
  inverterOrdemDoDia,
  type OrdemDoDia,
} from "@/lib/utils/ordem-do-dia";
import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";
import { renderConnectRate } from "./crossed-funnel-daily-table";

interface SalesDailyTableProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  campaignIds: string[];
  days: number;
}

function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}

function fmtDia(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const COLUNAS: {
  rotulo: string;
  dica: string;
  valor: (r: LinhaDiariaDeVendas) => ReactNode;
}[] = [
  { rotulo: "Investimento", dica: "Gasto Meta das campanhas da etapa no dia, com o imposto (12,15%)", valor: (r) => fmtCurrency(r.investimento) },
  { rotulo: "Vendas", dica: "Vendas do Produto Principal (Pg + Org + s/ track + Manual) — a mesma conta do card Vendas", valor: (r) => fmtInt(r.vendas) },
  { rotulo: "Vendas Pg", dica: "utm_source paga (meta-ads / google-ads)", valor: (r) => fmtInt(r.vendasPago) },
  { rotulo: "Vendas Org", dica: "utm_source preenchida e não paga", valor: (r) => fmtInt(r.vendasOrg) },
  { rotulo: "Vendas s/ track", dica: "Sem utm_source", valor: (r) => fmtInt(r.vendasSemTrack) },
  { rotulo: "Vendas Manual", dica: "Vendas lançadas à mão (PIX)", valor: (r) => fmtInt(r.vendasManual) },
  { rotulo: "Faturamento", dica: "Faturamento bruto do Produto Principal no dia", valor: (r) => fmtCurrency(r.faturamento) },
  { rotulo: "Ticket médio", dica: "Faturamento ÷ Vendas", valor: (r) => fmtCurrency(r.ticketMedio) },
  { rotulo: "CPV", dica: "Investimento ÷ Vendas Pg", valor: (r) => fmtCurrency(r.cpv) },
  { rotulo: "ROAS", dica: "Faturamento das vendas pagas ÷ Investimento", valor: (r) => fmtRoas(r.roas) },
  { rotulo: "Impressões", dica: "Impressões Meta", valor: (r) => fmtInt(r.impressoes) },
  { rotulo: "Cliques", dica: "Cliques no link (link_click)", valor: (r) => fmtInt(r.cliques) },
  { rotulo: "CTR", dica: "Cliques no link ÷ Impressões", valor: (r) => fmtPercent(r.ctr) },
  { rotulo: "CPM", dica: "Investimento × 1000 ÷ Impressões", valor: (r) => fmtCurrency(r.cpm) },
  { rotulo: "CPC", dica: "Investimento ÷ Cliques no link", valor: (r) => fmtCurrency(r.cpc) },
  { rotulo: "LP Views", dica: "landing_page_view da Meta", valor: (r) => fmtInt(r.lpViews) },
  { rotulo: "Connect Rate", dica: "LP Views ÷ Cliques no link × 100 (quantos cliques chegaram na LP). Verde acima de 70%", valor: (r) => renderConnectRate(r.connectRate) },
  { rotulo: "Checkouts", dica: "Checkouts iniciados (pixel)", valor: (r) => fmtInt(r.checkouts) },
];

export function SalesDailyTable({ projectId, funnelId, stageId, campaignIds, days }: SalesDailyTableProps) {
  const [ordem, setOrdem] = useState<OrdemDoDia>(ORDEM_DO_DIA_PADRAO);

  // As MESMAS queries (e chaves) do `SalesMetaKpis`: o react-query deduplica,
  // e o Total da tabela fecha com os cards porque lê os mesmos dados.
  const temCampanha = campaignIds.length > 0;
  const meta = useCampaignDailyInsightsBulk(projectId, temCampanha ? campaignIds : null, days);
  const mainSales = useStageSalesData(projectId, funnelId, stageId, "main_product,tmb", days);
  const salesSales = useStageSalesData(projectId, funnelId, stageId, "sales", days);

  const vendas = useMemo(() => {
    const main = mainSales.data && !mainSales.data.semDados ? mainSales.data : null;
    const sales = salesSales.data && !salesSales.data.semDados ? salesSales.data : null;
    return main ?? sales ?? null;
  }, [mainSales.data, salesSales.data]);

  const dados = useMemo(
    () => montarDadosDiariosDeVendas({ meta: meta.data, temCampanha, vendas, ordem }),
    [meta.data, temCampanha, vendas, ordem],
  );

  const carregando = (temCampanha && meta.isLoading) || mainSales.isLoading || salesSales.isLoading;

  if (carregando) return <Skeleton className="h-40" />;
  if (!dados.total) return null;

  const celulas = (r: LinhaDiariaDeVendas) =>
    COLUNAS.map((c) => (
      <TableCell key={c.rotulo} className="text-right whitespace-nowrap">
        {c.valor(r)}
      </TableCell>
    ));

  return (
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
              {COLUNAS.map((c) => (
                <TableHead key={c.rotulo} className="text-right whitespace-nowrap cursor-help" title={c.dica}>
                  {c.rotulo}
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
                  title="Vendas sem data na planilha — não caem em dia nenhum, mas entram no card e no Total"
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
  );
}
