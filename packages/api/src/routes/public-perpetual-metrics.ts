/**
 * Story 44.28 (AC3/AC4) — `GET /api/public/v1/funnels/:funnelId/perpetual-metrics`
 * para o agente Inácio.
 *
 * ## Por que esta rota existe
 *
 * O Inácio publica um Resumão diário para a diretoria e divergia da aba Meta
 * Ads. Uma das causas: os KPIs do perpétuo (CAC, ROAS, margem) eram calculados
 * **dentro do componente React** e só existiam no navegador. Para publicar "CAC
 * R$ 215,86" o agente teria que recompor a conta por fora — a segunda régua que
 * o Epic 44 inteiro existe para impedir.
 *
 * Agora as duas pontas leem as MESMAS funções:
 *
 * ```
 *   vendas   → services/perpetual-sales.ts   (era inline no handler autenticado)
 *   mídia    → services/meta-campaign-daily.ts
 *   KPIs     → shared/src/perpetuo-metricas.ts   (era um useMemo no dashboard)
 *   cadeia   → shared/src/cadeia-cac.ts
 * ```
 *
 * Nada aqui calcula: este arquivo autentica, resolve o funil, escolhe a janela
 * e compõe. Se um número desta rota divergir do painel, o defeito está numa das
 * quatro funções acima — e afeta os dois lados igualmente, que é o ponto.
 *
 * ## Duas armadilhas que este arquivo evita de propósito
 *
 * **1. O imposto de mídia não se aplica duas vezes.** `carregarSerieDiariaPorCampanha`
 * já devolve `spend` TRIBUTADO (`accumulate` aplicou `applyMetaTax`). Foi o bug
 * da 29.24, corrigido na 29.27. `calcularMetricasDoPerpetuo` documenta o mesmo
 * contrato do outro lado: "nunca reaplicar".
 *
 * **2. `vendas` e `vendasNoDia` são contagens diferentes, e a resposta diz qual
 * é qual.** O total do período deduplica por e-mail na janela inteira
 * (compradores únicos — a régua do card, e a que o CAC exige, já que CAC é
 * custo de aquisição de *cliente*). A série diária deduplica DENTRO do dia, e
 * por isso quem compra em dois dias conta duas vezes lá. **A soma da série é
 * maior ou igual ao total, e isso está certo.** O AC1 desta story manda expor a
 * régua do card como `vendas` e nomear a outra sem ambiguidade — daí
 * `vendasNoDia`.
 */

import fp from "fastify-plugin";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { funnels, funnelStages } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import {
  calcularVendasDoPerpetuo,
  calcularVendasDiariasDoPerpetuo,
} from "../services/perpetual-sales.js";
import { carregarSerieDiariaPorCampanha } from "../services/meta-campaign-daily.js";
import { businessToday, inicioDaJanela } from "../utils/sale-date.js";
// A API importa o shared por BARE import; o web vai por subpath. Os dois
// caminhos não são intercambiáveis e trocar derruba o boot em silêncio
// (Story 19.14) — `calcularMetricasDoPerpetuo` já é reexportado no índice.
import {
  agregar,
  calcularMetricas,
  calcularMetricasDoPerpetuo,
  vereditoDoPerpetuo,
  type DiaBruto,
} from "@loyola-x/shared";
import { PLATFORM_RATE_BREAKDOWN } from "../services/perpetual-report-config.js";

const paramsSchema = z.object({ funnelId: z.string().uuid() });

const querySchema = z.object({
  /** `YYYY-MM-DD`. Com `from` **e** `to`, a janela é exatamente essa. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Atalho para os cortes do Resumão: 1 (dia fechado), 7, 30, 90.
   *
   * Uma janela de N dias **inclui hoje** — `inicioDaJanela` é a régua única
   * desde a Story 44.27, que corrigiu o seletor somando faturamento de N+1 dias
   * contra investimento de N.
   */
  days: z.coerce.number().int().positive().max(365).optional(),
});

/** A janela efetiva, e de qual entrada ela veio. */
function resolverJanela(q: z.infer<typeof querySchema>): {
  from: string;
  to: string;
  dias: number;
  origem: "explicita" | "days" | "default";
} {
  const hoje = businessToday();
  if (q.from && q.to) {
    const dias =
      Math.round((Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000) + 1;
    return { from: q.from, to: q.to, dias, origem: "explicita" };
  }
  const dias = q.days ?? 30;
  return {
    from: inicioDaJanela(dias, hoje),
    to: hoje,
    dias,
    origem: q.days ? "days" : "default",
  };
}

export default fp(async function publicPerpetualMetricsRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/public/v1/funnels/:funnelId/perpetual-metrics",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "funnelId inválido", code: "BAD_REQUEST" });
      }
      const query = querySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }
      const { funnelId } = params.data;

      const [funil] = await fastify.db
        .select({
          id: funnels.id,
          projectId: funnels.projectId,
          name: funnels.name,
          type: funnels.type,
        })
        .from(funnels)
        .where(eq(funnels.id, funnelId))
        .limit(1);
      if (!funil) {
        return reply.code(404).send({ error: "Funil não encontrado", code: "NOT_FOUND" });
      }

      const janela = resolverJanela(query.data);

      // ── mídia ────────────────────────────────────────────────
      // As campanhas vinculadas às etapas do funil. Sem nenhuma, não há
      // investimento — e `calcularMetricasDoPerpetuo` trata isso como o ramo em
      // que CAC e ROAS não existem (`null`), em vez de dividir por zero.
      const etapas = await fastify.db
        .select({ campaigns: funnelStages.campaigns })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId));
      const campaignIds = [
        ...new Set(
          etapas
            .flatMap((e) => (Array.isArray(e.campaigns) ? e.campaigns : []))
            .map((c: unknown) => (typeof c === "string" ? c : ((c as { id?: string })?.id ?? "")))
            .filter(Boolean),
        ),
      ];

      const campanhas = await carregarSerieDiariaPorCampanha(fastify.db, {
        projectId: funil.projectId,
        campaignIds,
        from: janela.from,
        to: janela.to,
        explicitRange: true,
      });

      // ⚠️ `spend` já vem TRIBUTADO daqui. Não reaplicar (bug da 29.24).
      const diasDeMidia: DiaBruto[] = campanhas.flatMap((c) =>
        (c.days ?? []).map((d) => ({
          date: d.date,
          spend: d.spend,
          impressions: d.impressions,
          linkClicks: d.linkClicks,
          landingPageViews: d.landingPageViews,
          checkouts: d.checkouts,
        })),
      );
      const agregado = agregar(diasDeMidia);
      const temMidia = diasDeMidia.length > 0;

      // ── vendas ───────────────────────────────────────────────
      const vendas = await calcularVendasDoPerpetuo(fastify.db, {
        projectId: funil.projectId,
        funnelId,
        startDate: janela.from,
        endDate: janela.to,
      });
      /**
       * ⚠️ `semDados` e SÓ ele. A primeira versão desta linha somava
       * `&& vendas.platform !== null`, e isso apagava a distinção que o Epic 44
       * existe para proteger: janela sem NENHUMA venda devolve
       * `{...EMPTY_SALES_DATA, semDados: false}` (`perpetual-sales.ts:484`) —
       * um payload vazio cujo `platform` é `null` mas que afirma *"medimos e
       * deu zero"*, não *"não há fonte"*.
       *
       * Medido no `pps` em 08/09: 1d e 7d apareciam como `vendas: null` onde a
       * rota autenticada dizia `0`. "Nenhuma venda ontem" é informação de
       * gestão; "sem dado" manda o leitor procurar um defeito que não existe.
       */
      const temPlanilha = !vendas.semDados;

      const diarias = await calcularVendasDiariasDoPerpetuo(fastify.db, {
        funnelId,
        startDate: janela.from,
        endDate: janela.to,
      });

      // ── KPIs — a MESMA função que o dashboard usa ────────────
      const kpis = calcularMetricasDoPerpetuo({
        temCampanhas: campaignIds.length > 0,
        midia: temMidia ? { totalSpend: agregado.spend } : null,
        vendas: temPlanilha
          ? {
              totalVendas: vendas.totalVendas,
              faturamentoBruto: vendas.faturamentoBruto,
              faturamentoLiquidoCalculado: vendas.faturamentoLiquidoCalculado,
            }
          : null,
      });

      /**
       * A cadeia (CPM/CPC/CTR/connect rate/conversão de checkout) sai da mesma
       * função da aba Inácio, na família `paga` — que é o que um perpétuo é.
       * `convLP` é a conversão de checkout: `checkouts ÷ landingPageViews`.
       *
       * Sem mídia na janela não há cadeia, e `null` diz isso. Devolver zeros
       * afirmaria que medimos e deu zero — a distinção que o Epic 44 protege.
       */
      const cadeia = temMidia ? calcularMetricas(agregado, "paga") : null;

      /**
       * Story 44.30 (AC2) — o veredito vem PRONTO, e o agente não decide a cor.
       *
       * O Resumão de 06/09 chamou de "saudável" uma operação com ROAS 7d de
       * 1,47x contra meta de 2x. Não houve regra violada: não havia regra. Uma
       * instrução em prosa não conserta — LLM julgando produz julgamento
       * diferente a cada dia, e nenhum teste alcança isso.
       *
       * ⚠️ **A regra do §3.4 olha DUAS janelas** (7 e 30 dias) mais margem e
       * dias negativos — não a janela pedida. Então o veredito lê sempre os 30
       * dias que terminam em `periodo.to`, independente de `from`/`to`: pedir
       * 90 dias não pode mudar a cor, senão o mesmo funil teria vereditos
       * diferentes conforme quem perguntou.
       *
       * Custo: uma leitura de mídia e uma da planilha a mais por chamada. A
       * planilha tem cache de 30 s por `spreadsheetId`, então a segunda leitura
       * da mesma requisição não vai à rede.
       */
      const trintaDias = { from: inicioDaJanela(30, janela.to), to: janela.to };
      const serieDoVeredito = await (async () => {
        if (campaignIds.length === 0) return null;
        const cs = await carregarSerieDiariaPorCampanha(fastify.db, {
          projectId: funil.projectId,
          campaignIds,
          from: trintaDias.from,
          to: trintaDias.to,
          explicitRange: true,
        });
        const spendPorDia30 = new Map<string, number>();
        for (const c of cs) {
          for (const d of c.days ?? []) {
            spendPorDia30.set(d.date, (spendPorDia30.get(d.date) ?? 0) + d.spend);
          }
        }
        if (spendPorDia30.size === 0) return null;
        const diarias30 = await calcularVendasDiariasDoPerpetuo(fastify.db, {
          funnelId,
          startDate: trintaDias.from,
          endDate: trintaDias.to,
        });
        return { spendPorDia30, receitaPorDia30: (diarias30.byDay ?? {}) as Record<string, number> };
      })();

      /**
       * ROAS e margem de uma sub-janela, dos MESMOS dias dos dois lados.
       *
       * `null` quando não houve investimento nela — dividir por zero ou tratar
       * ausência como zero é o que a Story 44.26 fechou.
       */
      const janelaDoVeredito = (dias: number) => {
        /**
         * ⚠️ A janela SAI daqui junto com os números.
         *
         * A primeira versão devolvia só `{roas, margemPct, diasNegativos}` e o
         * `from` era remontado no payload com `inicioDaJanela(7, ...)` fixo.
         * Isso desacopla o rótulo do cálculo: trocar o argumento desta função
         * mudava a conta e **não** mudava a janela declarada. O teste de
         * reversão não pegava, porque a mentira estava do lado do rótulo.
         *
         * Declarar aqui é o que faz "o número e a janela dele" andarem juntos —
         * que é a regra que este epic inteiro existe para impor.
         */
        const de = inicioDaJanela(dias, janela.to);
        const periodo = { from: de, to: janela.to, dias };
        if (!serieDoVeredito) {
          return { ...periodo, roas: null, margemPct: null, diasNegativos: null };
        }
        let spend = 0;
        let receita = 0;
        let diasNegativos = 0;
        for (let i = 0; i < dias; i += 1) {
          const dia = inicioDaJanela(dias - i, janela.to);
          if (dia < de) continue;
          const s = serieDoVeredito.spendPorDia30.get(dia) ?? 0;
          const r = serieDoVeredito.receitaPorDia30[dia] ?? 0;
          spend += s;
          receita += r;
          // Um dia é negativo quando a receita LÍQUIDA dele não paga a mídia
          // dele — a mesma conta da margem (Story 29.20), por dia.
          if (s > 0 && r * (1 - (vendas.feeRate ?? 0)) - s < 0) diasNegativos += 1;
        }
        if (spend <= 0) return { ...periodo, roas: null, margemPct: null, diasNegativos: null };
        const margem = receita * (1 - (vendas.feeRate ?? 0)) - spend;
        return {
          ...periodo,
          roas: receita / spend,
          margemPct: receita > 0 ? (margem / receita) * 100 : null,
          diasNegativos,
        };
      };

      const sete = janelaDoVeredito(7);
      const trinta = janelaDoVeredito(30);

      // As taxas saem da plataforma da planilha (`PLATFORM_RATE_BREAKDOWN`, a
      // mesma fonte do relatório perpétuo desde a 41.8). Sem plataforma
      // conhecida elas chegam zeradas e o ponto de equilíbrio vira 1,00x — mais
      // permissivo, e por isso quem manda continua sendo a meta.
      const taxas =
        vendas.platform && vendas.platform in PLATFORM_RATE_BREAKDOWN
          ? PLATFORM_RATE_BREAKDOWN[vendas.platform as keyof typeof PLATFORM_RATE_BREAKDOWN]
          : undefined;
      const veredito = vereditoDoPerpetuo({
        roas7d: sete.roas,
        roas30d: trinta.roas,
        margem7dPct: sete.margemPct,
        diasNegativosEm7: sete.diasNegativos,
        taxas: taxas
          ? { plataforma: taxas.plataforma, imposto: taxas.imposto, outros: taxas.outros }
          : { plataforma: 0, imposto: 0, outros: 0 },
      });

      /**
       * AC4 — a série diária do Resumão, **um dia por linha**, mídia e vendas
       * lado a lado.
       *
       * `vendasNoDia` NÃO soma para `vendas` (ver o cabeçalho deste arquivo). O
       * nome carrega a diferença porque um campo chamado `vendas` aqui viraria
       * a segunda régua no dia em que alguém somasse a coluna.
       */
      const spendPorDia = new Map<string, number>();
      for (const d of diasDeMidia) {
        spendPorDia.set(d.date, (spendPorDia.get(d.date) ?? 0) + d.spend);
      }
      /**
       * ⚠️ `in`, não `as`. Sem planilha, `calcularVendasDiariasDoPerpetuo`
       * devolve um objeto que **não tem** `salesByDay` — e o compilador sabe
       * disso pela união. Um cast enganaria o tipo e o campo chegaria
       * `undefined` em runtime; o `in` deixa o TypeScript provar a presença.
       */
      const byDay = diarias.byDay ?? {};
      const salesByDay = "salesByDay" in diarias ? diarias.salesByDay : {};
      const serieDiaria = [...new Set([...spendPorDia.keys(), ...Object.keys(byDay)])]
        .sort()
        .map((date) => ({
          date,
          investimento: spendPorDia.get(date) ?? 0,
          faturamentoBruto: byDay[date] ?? 0,
          vendasNoDia: salesByDay[date] ?? 0,
        }));

      return {
        funnelId,
        projectId: funil.projectId,
        funnelName: funil.name,
        funnelType: funil.type,
        periodo: { from: janela.from, to: janela.to, dias: janela.dias, origem: janela.origem },

        /**
         * ⚠️ COMPRADORES ÚNICOS na janela — a régua do card e do CAC. Ver o
         * cabeçalho: não é a soma de `serieDiaria[].vendasNoDia`.
         */
        vendas: temPlanilha ? vendas.totalVendas : null,
        unidadeDeVendas: "compradores únicos no período" as const,

        investimento: temMidia ? agregado.spend : null,
        investimentoComImpostoDeMidia: true,
        faturamentoBruto: temPlanilha ? vendas.faturamentoBruto : null,
        faturamentoLiquidoCalculado: temPlanilha ? vendas.faturamentoLiquidoCalculado : null,
        ticketMedioBruto: temPlanilha ? vendas.ticketMedioBruto : null,

        cac: kpis?.cac ?? null,
        roas: kpis?.roas ?? null,
        margem: kpis?.margin ?? null,
        margemPercent: kpis?.marginPercent ?? null,

        orderBump: "orderBump" in vendas ? vendas.orderBump : null,
        reembolsos: temPlanilha
          ? {
              bruto: vendas.reembolsoBruto,
              liquido: vendas.reembolsoLiquido,
              quantidade: vendas.vendasReembolsadas,
              /** `false` = a planilha não tem coluna de status; o número é estimativa. */
              medido: vendas.reembolsoReal,
            }
          : null,

        /**
         * O veredito da janela, por regra. `cor`, `rotulo` e `motivo` vão
         * prontos: quem publica reporta, não julga (Story 44.30 AC2).
         */
        veredito,
        /**
         * As duas janelas que o veredito leu, para o texto poder citá-las. São
         * SEMPRE 7 e 30 dias terminando em `periodo.to` — não a janela pedida.
         */
        janelasDoVeredito: { sete, trinta },

        cadeia,
        agregadoDeMidia: temMidia ? agregado : null,
        /** Hot/cold por comprador, do `utm_term` — a mesma regra do painel. */
        porTemperatura:
          "analiseDeOrigem" in vendas ? vendas.analiseDeOrigem.porTemperatura : null,

        serieDiaria,

        /** `true` quando não há NEM mídia NEM planilha na janela. */
        semDados: !temMidia && !temPlanilha,
      };
    },
  );
});
