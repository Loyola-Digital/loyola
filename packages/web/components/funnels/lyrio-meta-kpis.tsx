"use client";

// ============================================================
// Story 42.13 (AC2) — o bloco "Meta Ads" da etapa Lyrio.
//
// Até aqui a etapa usava `SalesMetaKpis`, o bloco das etapas de venda, que lê
// planilha/Kiwify. O Lyrio vende pelo RevenueCat: Faturamento, Vendas, ROAS e
// os Tickets davam 0 desde 10/08, e LP Views/Checkouts não existem num app.
// Aqui a venda é a do canal Meta da rota `vendas-por-canal` — o MESMO estado
// (mesma consulta, mesmo `days`) do bloco RevenueCat e do Detalhamento, que o
// pai repassa. O tráfego continua vindo da Meta, como antes.
//
// Os números saem de `blocoMetaDoLyrio` (lib/utils, com teste); aqui só se
// desenha.
// ============================================================

import { ArrowRight, DollarSign, Eye, MousePointerClick, ShoppingCart, Target, TrendingUp, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import { sumMetaInsights } from "@/lib/utils/funnel-metrics";
import {
  blocoMetaDoLyrio,
  declaracaoDeCobertura,
  type EstadoDasVendas,
} from "@/lib/utils/vendas-por-canal-lyrio";

function fmtBRL(v: number | null): string {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtNum(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}%`;
}
function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}

function Card({
  icon: Icon,
  label,
  value,
  hint,
  tooltip,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tooltip?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-1 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}
      title={tooltip}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-base font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Etapa({ icon: Icon, label, value, highlight }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex-1 rounded-lg border p-3 space-y-1 min-w-0 ${highlight ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-sm font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Seta({ pct }: { pct: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground/50 shrink-0 px-0.5">
      <ArrowRight className="h-4 w-4" />
      <span className="text-[9px] font-medium text-muted-foreground tabular-nums leading-tight">{fmtPct(pct)}</span>
    </div>
  );
}

export function LyrioMetaKpis({
  projectId,
  campaignIds,
  days,
  vendas,
  revenuecatConectado,
  brlRate,
}: {
  projectId: string;
  campaignIds: string[];
  days: number;
  /** O estado da rota `vendas-por-canal` com o MESMO `days` (AC2d). */
  vendas: EstadoDasVendas;
  revenuecatConectado: boolean;
  brlRate: number | null;
}) {
  const { data: daily, isLoading, error: erroTrafego } = useCampaignDailyInsightsBulk(
    projectId,
    campaignIds.length > 0 ? campaignIds : null,
    days,
  );

  if (campaignIds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma campanha Meta vinculada.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Use &quot;Configurar&quot; → Campanhas Meta Ads pra cruzar vendas com gasto/CPM/ROAS.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  // Inclui o imposto de 12,15% (sumMetaInsights), como o bloco anterior. Com a
  // consulta em erro o tráfego é DESCONHECIDO (QA REL-001), não R$ 0.
  const somado = daily && !erroTrafego ? sumMetaInsights([daily]) : null;
  const trafego = somado ? { investimentoBrl: somado.spend, impressoes: somado.impressions, cliques: somado.linkClicks } : null;
  // Sem RevenueCat conectado a venda não é "zero", é desconhecida.
  const estado: EstadoDasVendas = revenuecatConectado ? vendas : { tipo: "oculto" };
  const b = blocoMetaDoLyrio({ trafego, estado, brlRate });
  const vendasCarregando = estado.tipo === "carregando";
  const fonte = "Vendas pagas do canal Meta no RevenueCat (o anúncio que o app registra no usuário)";

  return (
    <div className="space-y-4">
      {erroTrafego && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar o tráfego da Meta: {erroTrafego instanceof Error ? erroTrafego.message : String(erroTrafego)}
        </p>
      )}
      {estado.tipo === "erro" && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as vendas da Meta: {estado.mensagem}
        </p>
      )}
      {!revenuecatConectado && (
        <p className="text-[11px] text-muted-foreground">
          Conecte o RevenueCat em <strong>Configurar</strong> para ver as vendas da Meta.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Card icon={Zap} label="Investimento (Meta)" value={fmtBRL(b.investimentoBrl)} tooltip="Spend das campanhas vinculadas, com o imposto de 12,15%" />
        {vendasCarregando ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            <Card icon={ShoppingCart} label="Vendas (Meta)" value={fmtNum(b.vendas)} tooltip={`${fonte}. Toda receita paga conta: compra, renovação, conversão de teste.`} />
            <Card icon={DollarSign} label="Receita (Meta)" value={fmtBRL(b.receitaBrl)} tooltip={`${fonte}, convertida pelo câmbio`} highlight />
            <Card icon={TrendingUp} label="ROAS (Meta)" value={fmtRoas(b.roas)} tooltip="Receita da Meta ÷ investimento da Meta" highlight />
            <Card icon={Target} label="Custo por venda" value={fmtBRL(b.custoPorVenda)} tooltip="Investimento da Meta ÷ vendas da Meta" />
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Funil de Conversão</p>
        <div className="flex items-stretch gap-1">
          <Etapa icon={Eye} label="Impressões" value={fmtNum(b.impressoes)} />
          <Seta pct={b.ctr} />
          <Etapa icon={MousePointerClick} label="Cliques" value={fmtNum(b.cliques)} />
          <Seta pct={b.conversao} />
          <Etapa icon={DollarSign} label="Vendas (Meta)" value={fmtNum(b.vendas)} highlight />
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          Funil de tráfego pago (Meta) — &quot;Vendas&quot; são as vendas pagas do canal Meta no RevenueCat.
          {estado.tipo === "pronto" && ` ${declaracaoDeCobertura(estado.dados)}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Card icon={TrendingUp} label="CTR" value={fmtPct(b.ctr)} />
        <Card icon={DollarSign} label="CPM" value={fmtBRL(b.cpm)} />
      </div>
    </div>
  );
}
