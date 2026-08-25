"use client";

// ============================================================
// Story 18.70 (AC4-AC6) — AOV por público e Combo na etapa de Vendas.
//
// ## Por que um componente, e não o `LaunchDashboard`
//
// A página da etapa dá um early return para `SalesStageView` quando o tipo é
// `sales` (`page.tsx:126`) — nunca alcança o `LaunchDashboard`, onde a análise
// das 18.66–18.69 vive. Não é um predicado a relaxar; é uma tela que não a tem.
//
// O cálculo é o mesmo dos dois lados: `resumirOrderBump` e `tabelaPorPublico`
// na rota `stage-sales-data`, que nunca teve gating por tipo de etapa. Aqui só
// se consome.
//
// ## O que muda em relação à Captação Paga
//
// **Order bump praticamente não existe nesta etapa.** Medido nas 8 abas de
// venda de produção: 6 checkouts multi-linha em 433 linhas (1,4%), contra 126
// pedidos multi-produto na captação do `dg-pg04`. Por isso o bloco de bump não
// ocupa espaço fixo (AC6) — `orderBumpCardProps` já devolve `null` sem
// configuração, e é isso que se respeita aqui.
// ============================================================

import { ShoppingCart, Layers, Package } from "lucide-react";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import {
  aovCardProps,
  comboCardProps,
  orderBumpCardProps,
  PublicosTable,
} from "./order-bump-analysis";

/**
 * As duas planilhas do produto vendido. `capture` fica de fora de propósito: na
 * etapa de Vendas ele é um ESPELHO da aba da Captação Paga, e somá-lo aqui
 * contaria a receita da captação como se fosse desta etapa (AC7).
 */
const SUBTYPES_DA_VENDA = "main_product,tmb";

function CardSimples({
  icon: Icon,
  label,
  value,
  sub,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 transition-colors hover:border-border/50 ${title ? "cursor-help" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <span className="block text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function SalesStagePublicosSection({
  projectId,
  funnelId,
  stageId,
  days,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
}) {
  const { data } = useStageSalesData(projectId, funnelId, stageId, SUBTYPES_DA_VENDA, days);

  const ob = data?.orderBump;
  const aov = aovCardProps(ob);
  const combo = comboCardProps(ob);
  const bump = orderBumpCardProps(ob);

  // Sem planilha conectada, ou sem venda no período, não há o que dizer. O
  // `semDados` vem da própria rota — não se infere de `publicos` vazio, que
  // também acontece com planilha conectada e nenhuma venda no filtro.
  if (!data || data.semDados) return null;
  if (!aov && !combo && !bump && !data.publicos?.length) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Quem compra nesta etapa</h3>
        <p className="text-xs text-muted-foreground">
          Valor médio do pedido e conversão por origem do comprador. A base é a
          receita desta etapa — não inclui a captação.
        </p>
      </div>

      {(aov || combo || bump) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {aov && (
            <CardSimples
              icon={ShoppingCart}
              label="AOV"
              value={aov.value}
              sub={aov.sub}
              title={aov.title}
            />
          )}
          {/* Story 18.69: nunca somado ao order bump — são duas ofertas. */}
          {combo && (
            <CardSimples
              icon={Layers}
              label="Combo"
              value={combo.value}
              sub={combo.adesao}
              title={combo.title}
            />
          )}
          {/* AC6 — só aparece se alguém marcou bump nesta etapa. Card zerado
              fixo diria que a oferta fracassa, quando ela nem existe aqui. */}
          {bump && (
            <CardSimples
              icon={Package}
              label="Order bump"
              value={bump.value}
              sub={bump.adesao}
              title={bump.title}
            />
          )}
        </div>
      )}

      <PublicosTable
        publicos={data.publicos}
        temBump={ob?.temConfiguracao ?? false}
        temCombo={(ob?.comboReceita ?? 0) > 0}
      />
    </div>
  );
}
