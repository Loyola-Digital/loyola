"use client";

// ============================================================
// Story 42.14 — a grade de cards do Resumo mobile. O que cada card diz (valor,
// janela, memorial) vem de `cardsDoResumo`/`cardsDeAquisicao`, em `lib/utils`,
// com teste; aqui só se desenha. O `TooltipProvider` é o da etapa
// (`lyrio-stage-view.tsx`), que envolve a página inteira.
// ============================================================

import { DollarSign, Package, Receipt, Repeat, RefreshCcw, Scale, ShoppingCart, Target, TrendingUp, UserCheck, Users, Wallet, Zap } from "lucide-react";
import type { CardDoResumo, IconeDoCard } from "@/lib/utils/resumo-mobile-lyrio";
import { CardComJanela } from "./lyrio-card-com-janela";

const ICONES: Record<IconeDoCard, React.ComponentType<{ className?: string }>> = {
  investimento: Zap,
  receita: DollarSign,
  vendas: Receipt,
  roas: TrendingUp,
  margem: Wallet,
  mrr: Repeat,
  assinaturas: Package,
  trials: ShoppingCart,
  clientes: Users,
  cac: Target,
  ltv: UserCheck,
  renovacao: RefreshCcw,
  relacao: Scale,
};

export function GradeDoResumo({ cards }: { cards: readonly CardDoResumo[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <CardComJanela
          key={c.id}
          rotulo={c.rotulo}
          valor={c.valor}
          declaracao={c.declaracao}
          formula={c.formula}
          icone={ICONES[c.icone]}
          realce={c.realce}
          secundarias={c.secundarias}
          carregando={c.carregando}
          alerta={c.alerta}
          // Margem negativa em preto passa despercebida — e esta não pode.
          classeDoValor={c.negativo ? "text-red-600 dark:text-red-400" : undefined}
        />
      ))}
    </div>
  );
}
