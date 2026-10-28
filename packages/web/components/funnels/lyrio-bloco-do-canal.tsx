"use client";

// ============================================================
// Story 42.16 (AC3a) — os blocos "Meta Ads" e "Google Ads" da etapa Lyrio são
// ESTE componente, parametrizado pelo canal. Substitui o `LyrioMetaKpis` da
// 42.13 (a Meta) e o `GoogleAdsKpis` de `lyrio-stage-view.tsx` (o Google, com
// Conversões e CPA nativos, que saíram — D17).
//
// A venda é a linha do canal na rota `vendas-por-canal` — o MESMO estado
// (mesma consulta, mesmo `days`) do bloco RevenueCat e do Detalhamento, que o
// pai repassa. O tráfego também vem do pai: a Meta pela mesma consulta do
// Resumo (`useCampaignDailyInsightsBulk` com `days`), o Google pelo `/daily`
// por campanha vinculada, na régua de SP (`trafegoDoGoogleNaRegua`, AC2b).
//
// O que cada card diz (valor, período, memorial) sai de `cardsDoBlocoDoCanal`
// (lib/utils, com teste); aqui só se desenha. O card é o `SuperficieDoCard` da
// 42.14 (PO-01), pelo `CardComJanela`. O `TooltipProvider` é o da etapa.
// ============================================================

import { ArrowRight, DollarSign, Eye, MousePointerClick, ShoppingCart, Target, TrendingUp, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardDoBloco, CardsDoBloco, IconeDoBloco } from "@/lib/utils/cards-do-bloco-lyrio";
import { CardComJanela } from "./lyrio-card-com-janela";

const ICONES: Record<IconeDoBloco, React.ComponentType<{ className?: string }>> = {
  investimento: Zap,
  vendas: ShoppingCart,
  receita: DollarSign,
  roas: TrendingUp,
  custo: Target,
  impressoes: Eye,
  cliques: MousePointerClick,
  taxa: TrendingUp,
  cpm: DollarSign,
};

function Card({ c, className }: { c: CardDoBloco; className?: string }) {
  return (
    <div className={className}>
      <CardComJanela rotulo={c.rotulo} valor={c.valor} declaracao={c.declaracao} formula={c.formula} icone={ICONES[c.icone]} realce={c.realce} />
    </div>
  );
}

function Seta({ pct }: { pct: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground/50 shrink-0 px-0.5">
      <ArrowRight className="h-4 w-4" />
      <span className="text-[9px] font-medium text-muted-foreground tabular-nums leading-tight">{pct}</span>
    </div>
  );
}

export function LyrioBlocoDoCanal({
  canal,
  temCampanhas,
  cards,
  revenuecatConectado,
}: {
  canal: "meta" | "google";
  /** Sem campanha vinculada: a Meta mostra a orientação; o Google nem chega aqui (o pai esconde a seção, 42.13). */
  temCampanhas: boolean;
  cards: CardsDoBloco;
  revenuecatConectado: boolean;
}) {
  const nome = canal === "meta" ? "Meta" : "Google";
  const titulo = <h2 className="text-sm font-semibold text-muted-foreground">{cards.subtitulo}</h2>;

  if (!temCampanhas) {
    return (
      <>
        {titulo}
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma campanha {nome} vinculada.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use &quot;Configurar&quot; → Campanhas {canal === "meta" ? "Meta Ads" : "Google Ads"} pra cruzar vendas com gasto/CPM/ROAS.
          </p>
        </div>
      </>
    );
  }

  if (cards.carregandoTrafego) {
    return (
      <>
        {titulo}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </>
    );
  }

  const [investimento, ...dependentesDaVenda] = cards.principais;
  const aviso = cards.avisoDoTrafego;

  return (
    <>
      {titulo}
      <div className="space-y-4">
        {aviso && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-destructive">{aviso.titulo}</p>
            {aviso.detalhe && <p className="text-xs text-destructive/90 break-words">{aviso.detalhe}</p>}
            {aviso.orientacao && <p className="text-[11px] text-muted-foreground">{aviso.orientacao}</p>}
          </div>
        )}
        {cards.avisoDasVendas && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {cards.avisoDasVendas}
          </p>
        )}
        {!revenuecatConectado && (
          <p className="text-[11px] text-muted-foreground">
            Conecte o RevenueCat em <strong>Configurar</strong> para ver as vendas {canal === "meta" ? "da Meta" : "do Google"}.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Card c={investimento} />
          {cards.carregandoVendas
            ? dependentesDaVenda.map((c) => <Skeleton key={c.id} className="h-20" />)
            : dependentesDaVenda.map((c) => <Card key={c.id} c={c} />)}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Funil de Conversão</p>
          <div className="flex items-stretch gap-1">
            <Card c={cards.funil[0]} className="flex-1 min-w-0" />
            <Seta pct={cards.setas[0]} />
            <Card c={cards.funil[1]} className="flex-1 min-w-0" />
            <Seta pct={cards.setas[1]} />
            <Card c={cards.funil[2]} className="flex-1 min-w-0" />
          </div>
          <p className="text-[10px] text-muted-foreground/70">{cards.notaDoFunil}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {cards.taxas.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      </div>
    </>
  );
}
