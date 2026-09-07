"use client";

/**
 * Story 29.61 — order bump, upsell e AOV por público no Perpétuo.
 *
 * Espelha a seção da Captação Paga (18.66/18.67) e acrescenta o que só o
 * Perpétuo tem:
 *
 *   • coluna de **upsell** — terceiro tipo da 29.49, alavanca diferente do bump
 *   • marcação de **amostra baixa** — taxa de 0% sobre 2 pessoas não é fato
 *   • **recusa de afirmar** quando a origem não é confiável (AC7-bis)
 *
 * Nenhum cálculo aqui. A regra é de `utils/order-bump.ts`, no backend, a mesma
 * da Captação Paga — duas implementações divergiriam no dia em que a definição
 * de "taxa de bump" mudasse, e o gestor veria dois números em duas abas.
 */

import { Percent, Users, AlertTriangle, ShoppingCart, Layers } from "lucide-react";
import type { PerpetualSalesData } from "@loyola-x/shared";
import { diagnosticarPublico } from "@/lib/utils/publico-confiavel";
// Story 29.75 — as três regras dos cards vivem em `lib/utils` porque é o único
// diretório que o runner do pacote executa. Dentro deste `.tsx` elas não
// teriam teste, e são a razão de ser desta story.
import {
  adesaoDeBump,
  representatividadeDeBump,
  aovDoPerpetuo,
} from "@/lib/utils/cards-do-perpetuo";

/**
 * ⚠️ Estes formatadores aceitam `undefined` DE PROPÓSITO.
 *
 * O tipo diz `number`, e o `tsc` confia nele — mas o que chega em runtime é o
 * payload da API **em produção**, que pode ser mais velho que o front. Foi o
 * que aconteceu em 2026-09-04: a Story 29.74 acrescentou `receitaCaptacao` ao
 * resumo do order bump, o front subiu na Vercel antes da API, e
 * `undefined.toLocaleString()` derrubou o dashboard inteiro do Perpétuo com
 * "Cannot read properties of undefined (reading 'toLocaleString')".
 *
 * Um campo que ainda não existe deve virar `—` num canto da tela, nunca uma
 * página em branco. Não trocar por `v: number` de novo.
 */
const fmtCurrency = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumber = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR");
const fmtPct = (v: number | null) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * O card de representatividade. `null` quando não há produto classificado como
 * bump ou upsell — o caso de dois dos quatro funis perpétuos em produção.
 */
export function PerpetualOrderBumpCard({
  ob,
  bumpsDoResumo,
  vendasDoResumo,
  faturamentoBruto,
}: {
  ob: PerpetualSalesData["orderBump"];
  /**
   * Story 29.75 (AC2) — `porTipoProduto.order_bump`: LINHAS de bump, o mesmo
   * número que o resumo mostra em «Order Bump N».
   *
   * ⚠️ Não é `ob.compradoresComBump`. Aquele conta CHECKOUTS (35 onde o resumo
   * diz 41, medido no bbe-fc1-a1 em 07/09) e era a origem da divergência que
   * abriu esta story. Decisão do gestor: o resumo é a verdade, e o card fala
   * de PEDIDOS de bump — quem levar dois conta duas vezes.
   *
   * `null` quando a API não classifica produto: aí o card volta ao texto
   * antigo, por checkout, em vez de mostrar `—`.
   */
  bumpsDoResumo: number | null;
  /** `totalVendas` — a mesma base do KPI «Vendas». */
  vendasDoResumo: number | null;
  /** `faturamentoBruto` — o mesmo valor do card Faturamento Bruto. */
  faturamentoBruto: number | null;
}) {
  if (!ob || !ob.temConfiguracao || ob.faturamentoTotal <= 0) return null;

  /**
   * Story 29.75 (AC3) — a venda avulsa **compõe** o valor do card.
   *
   * Antes ela aparecia como uma linha à parte ("+ R$ 1.735,00 em venda
   * avulsa") e ficava fora da taxa. O gestor decidiu que ela entra: foi
   * vendida, é receita de bump.
   *
   * O denominador acompanha. Manter `receitaCaptacao` (que NÃO inclui o
   * avulso) com um numerador que passou a incluí-lo daria uma taxa que não
   * corresponde a razão nenhuma — some maçã, divida por pera. Passa a ser o
   * faturamento bruto, o mesmo do card do topo.
   */
  const {
    total: bumpTotal,
    taxa: representatividade,
    base: baseDaTaxa,
  } = representatividadeDeBump(
    ob.bumpAcessorio,
    ob.bumpAvulso,
    faturamentoBruto,
    ob.faturamentoTotal,
  );

  /** Sem classificação de produto na API, mantém a leitura antiga. */
  const { taxa: adesao, usaResumo } = adesaoDeBump(
    bumpsDoResumo,
    vendasDoResumo,
    ob.taxaDeAdesao,
  );

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Order Bump
        </span>
        <Percent className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p
        className="text-xl font-bold tracking-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 cursor-help"
        title={
          // Story 29.74 (AC7): o denominador é a RECEITA DA CAPTAÇÃO, e o
          // rótulo passou a dizer isso. Antes ele se chamava "faturamento
          // total" e valia R$ 55.814,00 enquanto o card do topo dizia
          // R$ 57.549,00 — duas definições de faturamento na mesma tela.
          "Representatividade = todo o order bump ÷ faturamento bruto.\n\n" +
          `Acessório: ${fmtCurrency(ob.bumpAcessorio)} — de compradores que TÊM produto principal.\n` +
          `Avulso: ${fmtCurrency(ob.bumpAvulso)} — de ${fmtNumber(ob.compradoresSoBump)} comprador(es) que só levaram produtos de bump, sem principal.\n` +
          `Total (numerador): ${fmtCurrency(bumpTotal)} — desde a Story 29.75 o avulso COMPÕE o valor; antes ficava de fora da taxa.\n\n` +
          `Faturamento bruto (denominador): ${fmtCurrency(baseDaTaxa)} — o mesmo valor do card Faturamento Bruto.\n\n` +
          (usaResumo
            ? `Adesão: ${fmtNumber(bumpsDoResumo)} order bumps em ${fmtNumber(vendasDoResumo)} vendas — os mesmos números do resumo. Conta PEDIDOS de bump: quem levou dois conta duas vezes.`
            : `Adesão por checkout: ${fmtNumber(ob.compradoresComBump)} de ${fmtNumber(ob.compradoresComPrincipal)} — a API não classifica produto neste funil, então o número do resumo não existe.`)
        }
      >
        {fmtPct(representatividade)}
      </p>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight space-y-0.5">
        <p className="tabular-nums">{fmtCurrency(bumpTotal)}</p>
        {usaResumo ? (
          // Story 29.75 (AC2): "order bumps"/"vendas", não "compradores" — o
          // numerador conta pedidos, e chamá-los de pessoas seria falso.
          <p>
            {fmtNumber(bumpsDoResumo)} order bumps em {fmtNumber(vendasDoResumo)} vendas (
            {fmtPct(adesao)})
          </p>
        ) : (
          <p>
            {fmtNumber(ob.compradoresComBump)} de {fmtNumber(ob.compradoresComPrincipal)}{" "}
            compradores ({fmtPct(adesao)})
          </p>
        )}
        {ob.bumpAvulso > 0 && (
          // AC3: deixa de ser "+ R$ X" (que somava por fora) e passa a
          // declarar quanto do total acima veio de venda avulsa.
          <p className="text-amber-600 dark:text-amber-400">
            inclui {fmtCurrency(ob.bumpAvulso)} de venda avulsa
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Card de AOV. Diferente do de Order Bump, este aparece mesmo sem produto
 * classificado: valor médio do pedido é receita ÷ compradores e não depende de
 * bump nenhum.
 */
export function PerpetualAovCard({
  ob,
  vendasDoResumo,
  faturamentoBruto,
}: {
  ob: PerpetualSalesData["orderBump"];
  /** Story 29.75 (AC4) — `totalVendas`, a mesma base do KPI «Vendas». */
  vendasDoResumo: number | null;
  /** Story 29.75 (AC4) — `faturamentoBruto`, o mesmo do card do topo. */
  faturamentoBruto: number | null;
}) {
  if (!ob || ob.aovGeral == null) return null;

  /**
   * Story 29.75 (AC4) — AOV = faturamento bruto TOTAL ÷ vendas do resumo.
   *
   * Antes era `receitaCaptacao ÷ compradoresComPrincipal`: um denominador em
   * checkouts (149) sobre um numerador que excluía a venda avulsa. Medido no
   * bbe-fc1-a1 em 07/09: R$ 58.240,37 ÷ 149 = R$ 390,87, contra
   * R$ 59.975,37 ÷ 153 = R$ 391,99 na regra nova.
   *
   * A diferença é pequena aqui e não é o ponto: o ponto é o card deixar de ter
   * base própria. Com esta mudança, AOV × Vendas fecha com o Faturamento
   * Bruto do topo — antes não fechava com nada na tela.
   */
  const { valor: aov, usaResumo } = aovDoPerpetuo(
    faturamentoBruto,
    vendasDoResumo,
    ob.aovGeral,
  );

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          AOV
        </span>
        <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p
        className="text-xl font-bold tracking-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 cursor-help"
        title={
          usaResumo
            ? "AOV (valor médio do pedido) = faturamento bruto ÷ vendas.\n\n" +
              `${fmtCurrency(faturamentoBruto)} ÷ ${fmtNumber(vendasDoResumo)} = ${fmtCurrency(aov)}\n\n` +
              "Story 29.75 (AC4): os dois números são os mesmos dos cards Faturamento Bruto e Vendas, no topo. Antes o AOV tinha base própria (receita da captação ÷ checkouts) e não fechava com nenhum outro número da tela."
            : "AOV (valor médio do pedido) = (produto principal + adicionais) ÷ compradores.\n\n" +
              `Base: ${fmtNumber(ob.compradoresComPrincipal)} compradores com produto principal.\n` +
              (ob.compradoresSoBump > 0
                ? `Não inclui ${fmtNumber(ob.compradoresSoBump)} comprador(es) que só levaram produtos de bump — sem pedido principal, entrariam no denominador puxando o número para baixo.\n`
                : "")
        }
      >
        {fmtCurrency(aov)}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {usaResumo
          ? `${fmtNumber(vendasDoResumo)} vendas`
          : `${fmtNumber(ob.compradoresComPrincipal)} compradores`}
      </p>
    </div>
  );
}

/**
 * Story 18.69 — o bloco do Combo, com a MESMA estrutura do order bump:
 * representatividade e conversão, e a quebra pelos mesmos públicos.
 *
 * ⚠️ Os dois blocos NUNCA se somam. Decisão do gestor (2026-08-25): são duas
 * ofertas com dois números, lado a lado. Um total unificado ("upgrade") foi
 * proposto e recusado por confundir a leitura.
 */
export function PerpetualComboCard({ ob }: { ob: PerpetualSalesData["orderBump"] }) {
  if (!ob || !ob.comboReceita || ob.comboReceita <= 0) return null;
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Combo
        </span>
        <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p
        className="text-xl font-bold tracking-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 cursor-help"
        title={
          "Representatividade do combo = receita de combo ÷ receita da captação.\n\n" +
          "O combo SUBSTITUI o produto principal, com o extra embutido — quem compra combo não tem linha do principal.\n\n" +
          "Não se soma ao order bump: são duas ofertas diferentes para o mesmo extra."
        }
      >
        {fmtPct(ob.comboRepresentatividade ?? null)}
      </p>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight space-y-0.5">
        <p className="tabular-nums">{fmtCurrency(ob.comboReceita)}</p>
        <p>
          {fmtNumber(ob.compradoresComCombo ?? 0)} de {fmtNumber(ob.compradoresComPrincipal)}{" "}
          compradores ({fmtPct(ob.taxaDeCombo ?? null)})
        </p>
      </div>
    </div>
  );
}

export function PerpetualPublicosTable({
  publicos,
  temBump,
  temCombo,
  temUpsell,
  investimento,
}: {
  publicos: PerpetualSalesData["publicos"];
  temBump: boolean;
  /** Story 18.69 — a coluna some quando ninguém classificou um combo. */
  temCombo: boolean;
  temUpsell: boolean;
  /** Investimento do período, para o detector do AC7-bis. */
  investimento: number | null;
}) {
  if (!publicos || publicos.length === 0) return null;

  // AC7-bis — antes de mostrar qualquer coisa, a dimensão precisa poder ser
  // afirmada. Num funil com investimento e nenhum comprador classificado como
  // pago, a coluna mapeada como `utm_source` não é uma UTM (medido: `dg-a1`,
  // 2.147 linhas) e a tabela diria "100% Orgânico" para tráfego pago frio.
  const diagnostico = diagnosticarPublico(publicos, investimento);

  const total = publicos.reduce((s, p) => s + p.compradores, 0);
  const totalBump = publicos.reduce((s, p) => s + p.compradoresComBump, 0);
  const totalCombo = publicos.reduce((s, p) => s + (p.compradoresComCombo ?? 0), 0);
  const totalUpsell = publicos.reduce((s, p) => s + p.compradoresComUpsell, 0);
  const totalPrincipal = publicos.reduce((s, p) => s + p.receitaPrincipal, 0);
  const totalAdicional = publicos.reduce((s, p) => s + p.receitaBump + p.receitaUpsell, 0);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Público: conversão e valor do pedido
        </h3>
        <span className="text-[10px] text-muted-foreground">
          conta COMPRADORES — a quebra do card de Vendas conta linhas, e os dois números diferem
        </span>
      </div>

      {!diagnostico.confiavel ? (
        // Recusar afirmar é a decisão. Uma tabela dizendo "100% Orgânico" para
        // um funil de tráfego pago é pior que tabela nenhuma: ninguém desconfia
        // de um número apresentado com essa cara.
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              Dimensão de público indisponível
            </p>
            <p className="text-muted-foreground">{diagnostico.motivo}</p>
            <p className="text-muted-foreground">
              AOV geral do período:{" "}
              <span className="tabular-nums font-medium text-foreground">
                {total > 0 ? fmtCurrency((totalPrincipal + totalAdicional) / total) : "—"}
              </span>{" "}
              ({fmtNumber(total)} compradores)
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-2 pr-3">Público</th>
                <th className="text-right px-2">Compradores</th>
                {temBump && <th className="text-right px-2">Conv. Order Bump</th>}
                {temCombo && <th className="text-right px-2">Conv. Combo</th>}
                {temUpsell && <th className="text-right px-2">Conv. Upsell</th>}
                <th className="text-right px-2">AOV s/ adicionais</th>
                {(temBump || temUpsell) && <th className="text-right px-2">AOV c/ adicionais</th>}
                {(temBump || temUpsell) && <th className="text-right px-2">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {publicos.map((p) => {
                const delta =
                  p.aovSemBump && p.aovComBump && p.aovSemBump > 0
                    ? p.aovComBump / p.aovSemBump - 1
                    : null;
                /**
                 * AC3-bis — a taxa de um balde de 2 pessoas não pode ter a
                 * mesma autoridade visual que a de 94. "0,0%" ali se lê como
                 * "esse público não adere", quando significa "duas pessoas não
                 * aderiram".
                 */
                const taxa = (valor: number | null, n: number) =>
                  p.amostraBaixa ? (
                    <span
                      className="text-muted-foreground/70 cursor-help"
                      title={`Amostra pequena: ${p.compradores} comprador(es). A taxa varia muito com uma conversão a mais ou a menos — leia com cautela.`}
                    >
                      {fmtPct(valor)}
                      <span className="ml-0.5">*</span>
                    </span>
                  ) : (
                    <>
                      {fmtPct(valor)}
                      <span className="text-[10px] text-muted-foreground"> ({fmtNumber(n)})</span>
                    </>
                  );
                return (
                  <tr key={p.publico} className="border-b border-border/10 hover:bg-muted/30">
                    <td className="py-2 pr-3">{p.publico}</td>
                    <td className="text-right px-2 tabular-nums">{fmtNumber(p.compradores)}</td>
                    {temBump && (
                      <td className="text-right px-2 tabular-nums">
                        {taxa(p.taxaBump, p.compradoresComBump)}
                      </td>
                    )}
                    {temCombo && (
                      <td className="text-right px-2 tabular-nums">
                        {taxa(p.taxaCombo ?? null, p.compradoresComCombo ?? 0)}
                      </td>
                    )}
                    {temUpsell && (
                      <td className="text-right px-2 tabular-nums">
                        {taxa(p.taxaUpsell, p.compradoresComUpsell)}
                      </td>
                    )}
                    <td className="text-right px-2 tabular-nums">
                      {p.aovSemBump == null ? "—" : fmtCurrency(p.aovSemBump)}
                    </td>
                    {(temBump || temUpsell) && (
                      <td className="text-right px-2 tabular-nums font-medium">
                        {p.aovComBump == null ? "—" : fmtCurrency(p.aovComBump)}
                      </td>
                    )}
                    {(temBump || temUpsell) && (
                      <td className="text-right px-2 tabular-nums text-emerald-400">
                        {delta == null || delta === 0 ? "—" : `+${(delta * 100).toFixed(0)}%`}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t border-border/30 font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="text-right px-2 tabular-nums">{fmtNumber(total)}</td>
                {temBump && (
                  <td className="text-right px-2 tabular-nums">
                    {fmtPct(total > 0 ? totalBump / total : null)}
                  </td>
                )}
                {temCombo && (
                  <td className="text-right px-2 tabular-nums">
                    {fmtPct(total > 0 ? totalCombo / total : null)}
                  </td>
                )}
                {temUpsell && (
                  <td className="text-right px-2 tabular-nums">
                    {fmtPct(total > 0 ? totalUpsell / total : null)}
                  </td>
                )}
                <td className="text-right px-2 tabular-nums">
                  {total > 0 ? fmtCurrency(totalPrincipal / total) : "—"}
                </td>
                {(temBump || temUpsell) && (
                  <td className="text-right px-2 tabular-nums">
                    {total > 0 ? fmtCurrency((totalPrincipal + totalAdicional) / total) : "—"}
                  </td>
                )}
                {(temBump || temUpsell) && (
                  <td className="text-right px-2 tabular-nums text-emerald-400">
                    {totalPrincipal > 0
                      ? `+${(((totalPrincipal + totalAdicional) / totalPrincipal - 1) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
          {publicos.some((p) => p.amostraBaixa) && (
            <p className="text-[10px] text-muted-foreground mt-2">
              * amostra menor que 10 compradores — a taxa varia muito com uma conversão a mais
            </p>
          )}
        </div>
      )}
    </div>
  );
}
