"use client";

/**
 * Públicos quente e frio no Perpétuo.
 *
 * Três donuts que respondem a três perguntas diferentes — e é a distância entre
 * elas que vale olhar:
 *
 *   1. **investimento** — para onde a verba foi (nome da campanha);
 *   2. **compradores**  — de onde vieram as pessoas (`utm_term` da venda);
 *   3. **receita**      — de onde veio o dinheiro (idem, ponderado).
 *
 * Quem gasta 70% no frio e fatura 30% dele tem um problema que nenhum dos três
 * números mostra sozinho.
 *
 * ## Duas fontes, de propósito
 *
 * O investimento vem do **nome da campanha**; comprador e receita vêm do
 * **`utm_term`** da venda. São dois carimbos diferentes, feitos por pessoas
 * diferentes, e podem discordar — a campanha chamada `[HOT]` traz gente com
 * `utm_term` frio quando o público foi trocado sem renomear. Unificar em uma
 * fonte só esconderia justamente esse desencontro, que é acionável.
 */

import { Flame, Snowflake, Info } from "lucide-react";
import { HotColdSpendDonut } from "./hot-cold-spend-donut";
import { HotColdCountDonut } from "./hot-cold-count-donut";
import {
  agregarCompradores,
  agregarReceita,
  temTemperatura,
  type PublicoDoPerpetuo,
} from "@/lib/utils/perpetuo-hot-cold";
import type { CampaignAnalytics } from "@/lib/hooks/use-traffic-analytics";

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="mb-4 text-sm font-semibold">{titulo}</h3>
      <p className="py-8 text-center text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

export function PerpetualHotColdSection({
  campaigns,
  publicos,
}: {
  campaigns: CampaignAnalytics[];
  publicos: PublicoDoPerpetuo[] | undefined;
}) {
  const lista = publicos ?? [];
  const compradores = agregarCompradores(lista);
  const receita = agregarReceita(lista);
  const classificado = temTemperatura(lista);

  // Nada de campanha nem de venda: a seção inteira sai. Um bloco de três
  // caixas vazias ocupa a tela sem dizer nada.
  if (campaigns.length === 0 && lista.length === 0) return null;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <Flame className="size-4 text-[hsl(10_80%_55%)]" />
        <Snowflake className="size-4 text-[hsl(210_80%_55%)]" />
        <h2 className="text-base font-semibold">Públicos quente e frio</h2>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info className="size-3" />
          investimento vem do nome da campanha; comprador e receita, do{" "}
          <code className="font-mono">utm_term</code> da venda
        </span>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {campaigns.length > 0 ? (
          <HotColdSpendDonut campaigns={campaigns} />
        ) : (
          <Vazio
            titulo="Distribuição de Investimento"
            texto="Vincule as campanhas do funil para ver quanto vai para cada público."
          />
        )}

        {compradores && classificado ? (
          <HotColdCountDonut
            aggregate={compradores}
            title="Distribuição de Compradores"
            noun={{ singular: "comprador", plural: "compradores" }}
          />
        ) : (
          <Vazio
            titulo="Distribuição de Compradores"
            texto={
              lista.length === 0
                ? "Sem vendas no período."
                : "Nenhuma venda tem temperatura: mapeie a coluna utm_term na planilha para separar quente de frio."
            }
          />
        )}

        {receita && classificado ? (
          <HotColdCountDonut
            aggregate={receita}
            title="Distribuição de Receita"
            noun={{ singular: "real", plural: "reais" }}
          />
        ) : (
          <Vazio
            titulo="Distribuição de Receita"
            texto={
              lista.length === 0
                ? "Sem vendas no período."
                : "Sem temperatura nas vendas — mesma coluna utm_term."
            }
          />
        )}
      </div>
    </section>
  );
}
